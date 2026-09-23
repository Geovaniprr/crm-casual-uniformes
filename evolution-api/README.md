# Evolution API (na sua máquina) → CRM na Vercel

Esta pasta sobe uma instância local do Evolution API conectada ao seu
WhatsApp. Ela manda um webhook pra internet (o site na Vercel) toda vez que
**alguém te envia mensagem**, e a Vercel cria um lead novo (coluna "Novo
Lead") só se o número ainda não existe no CRM — se já existe, não mexe em
nada, você move os cards manualmente.

Pré-requisito: o site já publicado na Vercel (peça pra quem administra o
projeto o link, ex.: `https://seu-crm.vercel.app`) e o segredo do webhook
configurado nas variáveis de ambiente da Vercel (`EVOLUTION_WEBHOOK_SECRET`).

## 1. Instalar o Docker Desktop

Baixe em https://www.docker.com/products/docker-desktop/, instale, abra uma
vez pra confirmar que está rodando.

## 2. Subir o Evolution API

```bash
cd "evolution-api"
docker compose up -d
docker logs -f evolution_api
```

Espere aparecer algo como `Server running on http://localhost:8080` no log.

## 3. Criar a instância do WhatsApp já com o webhook configurado

Troque `SEU-CRM.vercel.app` pela URL real do site, e `SEU-SEGREDO-AQUI` pelo
valor combinado com quem administra o projeto (tem que ser **idêntico** ao
`EVOLUTION_WEBHOOK_SECRET` configurado na Vercel).

```bash
curl -X POST http://localhost:8080/instance/create \
  -H "Content-Type: application/json" \
  -H "apikey: 02f7a1ed9df605b358a12ddd3a8307aa8831fcc70c0ad566" \
  -d '{
    "instanceName": "casual-crm",
    "qrcode": true,
    "integration": "WHATSAPP-BAILEYS",
    "webhook": {
      "enabled": true,
      "url": "https://SEU-CRM.vercel.app/webhook/evolution/SEU-SEGREDO-AQUI",
      "webhookByEvents": false,
      "events": ["MESSAGES_UPSERT"]
    }
  }'
```

## 4. Escanear o QR Code

```bash
curl http://localhost:8080/instance/connect/casual-crm \
  -H "apikey: 02f7a1ed9df605b358a12ddd3a8307aa8831fcc70c0ad566"
```

A resposta traz um campo `base64` com uma imagem `data:image/png;base64,...`.
Cole esse valor em um conversor online de "base64 para imagem" (ou abra em
uma aba do navegador colando o valor completo na barra de endereço) e
escaneie com o WhatsApp que vai ficar conectado (Configurações → Aparelhos
conectados → Conectar um aparelho).

## 5. Testar

Peça pra alguém (com um número que ainda não está no CRM) mandar uma
mensagem no WhatsApp conectado. Em alguns segundos, um novo card deve
aparecer na coluna **"Novo Lead"** no site da Vercel (atualize a página).

Pra conferir se o webhook está chegando, os logs ficam no painel da Vercel
(Project → Deployments → clique no deployment → Functions → `server.py`).

## Observações

- O Docker/Evolution API precisa ficar **ligado o tempo todo** nessa máquina
  pra continuar recebendo mensagens — se o computador desligar ou o Docker
  fechar, o WhatsApp para de mandar os webhooks até voltar.
- Se o WhatsApp desconectar (ex.: celular ficou muito tempo offline), repita
  o passo 4 pra gerar um novo QR Code.
