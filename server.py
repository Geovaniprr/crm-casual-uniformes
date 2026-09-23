import os
import re
import uuid
import logging
from datetime import datetime, timezone

import requests
from flask import Flask, request, jsonify

# Na Vercel, o site estático (public/index.html, app.js, style.css) é servido
# direto pela CDN, sem passar por este arquivo. Esta função só cuida do
# webhook do Evolution API.
app = Flask(__name__)
logging.basicConfig(level=logging.INFO)
log = logging.getLogger("evolution-webhook")

# Mesmo projeto/chave publicável usados em app.js (protegidos por RLS no Supabase).
SUPABASE_URL = "https://umtmgapioumgbpeiyhko.supabase.co"
SUPABASE_KEY = "sb_publishable_Kmc1f8fz7zZimsrBnwq3KA_OM2G5kMC"

# Segredo próprio do webhook: definido como variável de ambiente no projeto da
# Vercel (Settings > Environment Variables), NÃO fica hardcoded aqui. Sem
# isso, qualquer pessoa que descobrisse a URL poderia criar leads falsos.
WEBHOOK_SECRET = os.environ.get("EVOLUTION_WEBHOOK_SECRET", "troque-este-segredo")


@app.route("/")
def index():
    return jsonify({"ok": True, "service": "evolution-webhook"})


def supa_headers(extra=None):
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": "Bearer " + SUPABASE_KEY,
        "Content-Type": "application/json",
    }
    if extra:
        headers.update(extra)
    return headers


def only_digits(value):
    return re.sub(r"\D", "", value or "")


def now_iso():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def find_lead_by_phone(digits):
    """Casa pelo final do número (8 dígitos) pra tolerar variações de
    formatação (com/sem 55, com/sem o 9 extra do celular)."""
    key = digits[-8:] if len(digits) >= 8 else digits
    if not key:
        return []
    resp = requests.get(
        SUPABASE_URL + "/rest/v1/leads",
        headers=supa_headers(),
        params={"select": "id,phone", "phone": "ilike.*" + key + "*", "limit": "5"},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()


def create_lead(name, phone):
    lead_id = "lead_" + uuid.uuid4().hex[:12]
    ts = now_iso()
    body = {
        "id": lead_id,
        "name": name,
        "phone": phone,
        "origin": "WhatsApp direto",
        "stage": "novo_lead",
        "responsible": "",
        "tags": [],
        "quantity": None,
        "size_grid": "",
        "product": "",
        "fabric": "",
        "color": "",
        "customization": "",
        "has_logo": "",
        "deadline": None,
        "created_at": ts,
        "stage_entered_at": ts,
        "last_message_at": ts,
        "wait_reason": "",
        "next_follow_up_at": None,
        "notes": "",
        "closed": None,
        "repass": None,
        "delivery": None,
        "history": [{"at": ts, "text": "Lead criado automaticamente (mensagem recebida no WhatsApp)"}],
        "photos": [],
        "updated_at": ts,
    }
    resp = requests.post(
        SUPABASE_URL + "/rest/v1/leads?on_conflict=id",
        headers=supa_headers({"Prefer": "resolution=merge-duplicates,return=minimal"}),
        json=[body],
        timeout=10,
    )
    resp.raise_for_status()
    return lead_id


@app.route("/webhook/evolution/<secret>", methods=["POST"])
def evolution_webhook(secret):
    if secret != WEBHOOK_SECRET:
        return jsonify({"error": "forbidden"}), 403

    payload = request.get_json(silent=True) or {}
    event = (payload.get("event") or "").upper().replace(".", "_")
    if event != "MESSAGES_UPSERT":
        return jsonify({"ignored": event or "no_event"}), 200

    data = payload.get("data") or {}
    key = data.get("key") or {}

    if key.get("fromMe"):
        return jsonify({"ignored": "fromMe"}), 200

    remote_jid = key.get("remoteJid") or ""
    if "@g.us" in remote_jid or "broadcast" in remote_jid:
        return jsonify({"ignored": "group_or_status"}), 200

    digits = only_digits(remote_jid.split("@")[0])
    if not digits:
        return jsonify({"ignored": "no_phone"}), 200

    try:
        existing = find_lead_by_phone(digits)
    except Exception:
        log.exception("Falha ao consultar Supabase")
        return jsonify({"error": "supabase_query_failed"}), 502

    if existing:
        log.info("Mensagem de %s ja tem lead (%s) - ignorando", digits, existing[0]["id"])
        return jsonify({"ok": True, "existing_lead": existing[0]["id"]}), 200

    name = data.get("pushName") or digits

    try:
        lead_id = create_lead(name, digits)
    except Exception:
        log.exception("Falha ao criar lead no Supabase")
        return jsonify({"error": "supabase_insert_failed"}), 502

    log.info("Novo lead criado: %s (%s)", name, digits)
    return jsonify({"ok": True, "created": True, "lead_id": lead_id}), 201


if __name__ == "__main__":
    app.run(debug=True, port=5000)
