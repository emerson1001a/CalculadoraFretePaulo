# Checklist WhatsApp DEV

Este arquivo registra a configuração que funcionou no ambiente DEV.

## Render DEV

Servico: `rode-com-lucro-api-dev`

Variaveis necessarias:

```txt
WHATSAPP_VERIFY_TOKEN=rode-com-lucro-dev-2026
WHATSAPP_ACCESS_TOKEN=<token temporario gerado na Meta>
WHATSAPP_PHONE_NUMBER_ID=1212280955297569
WHATSAPP_API_VERSION=v25.0
```

Depois de alterar variaveis no Render, fazer:

```txt
Manual Deploy > Deploy latest commit
```

## Meta

App usado: `Rode com Lucro DEV`

Tela:

```txt
WhatsApp > Configuracao da API
```

Dados importantes:

```txt
Numero de teste: +1 555 196 0309
Identificacao do numero de telefone: 1212280955297569
```

O telefone de quem vai testar precisa estar selecionado/adicionado no campo:

```txt
Ate
```

Se nao estiver, a resposta falha com:

```txt
Recipient phone number not in allowed list
```

## Webhook

Tela:

```txt
WhatsApp > Configuracao > Webhook
```

URL de callback:

```txt
https://rode-com-lucro-api-dev.onrender.com/webhook/whatsapp
```

Token de verificacao:

```txt
rode-com-lucro-dev-2026
```

Campo do webhook que precisa estar assinado:

```txt
messages
```

## Testes

Verificar webhook pelo navegador:

```txt
https://rode-com-lucro-api-dev.onrender.com/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=rode-com-lucro-dev-2026&hub.challenge=teste123
```

Resultado esperado:

```txt
teste123
```

Verificar variaveis carregadas no Render:

```txt
https://rode-com-lucro-api-dev.onrender.com/api/whatsapp/status
```

Teste interno sem enviar WhatsApp:

```cmd
curl -X POST https://rode-com-lucro-api-dev.onrender.com/api/whatsapp/teste ^
-H "Content-Type: application/json" ^
-d "{\"telefone\":\"5511999999999\",\"mensagem\":\"Frete de Sao Paulo para Curitiba, valor 2500, distancia 410 km, diesel 6,20, consumo 3 km/l, pedagio 180\"}"
```

Mensagem real para enviar ao numero de teste:

```txt
Frete de Sao Paulo para Curitiba, valor 2500, distancia 410 km, diesel 6,20, consumo 3 km/l, pedagio 180
```
