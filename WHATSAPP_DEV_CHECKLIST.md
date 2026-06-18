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
OPENAI_API_KEY=<chave da OpenAI>
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

## Memoria curta de conversa

Se faltar um dado, o sistema guarda um rascunho pelo telefone e pergunta apenas o primeiro dado faltante.

Exemplo:

```txt
Frete de Santos para Campinas, valor 3200, diesel 6,10, consumo 3 km/l, pedagio 95
```

Resposta esperada:

```txt
Entendi. Para calcular melhor, me informe a distancia aproximada em km.
```

Depois, responder apenas:

```txt
210 km
```

Resultado esperado:

```txt
Resultado do frete...
```

Para apagar um rascunho em andamento:

```txt
cancelar
```

## Interpretacao com IA

O WhatsApp tenta primeiro entender a mensagem com o parser simples.
Se faltar algum dado ou a mensagem vier mais informal, a IA tenta transformar o texto em campos estruturados.

A IA nao calcula lucro, custo ou margem. Ela apenas interpreta a mensagem.
O calculo continua sendo feito pela calculadora do sistema.

Exemplo de mensagem mais natural:

```txt
Peguei um frete de Santos pra Campinas por 3200, deve dar 210 km, diesel ta 6,10, pedagio 95, o caminhao faz 3 por litro
```

Resultado esperado:

```txt
Resultado do frete...
```
