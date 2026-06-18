const express = require("express");
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const OpenAI = require("openai");

const app = express();
const PORT = process.env.PORT || 3010;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});
const dataDir = path.join(__dirname, "data");

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DB_PATH || path.join(dataDir, "fretes.db");
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS fretes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    data TEXT NOT NULL,
    origem TEXT,
    destino TEXT,
    valor_frete REAL NOT NULL DEFAULT 0,
    km_ida REAL NOT NULL DEFAULT 0,
    km_volta REAL NOT NULL DEFAULT 0,
    km_total REAL NOT NULL DEFAULT 0,
    custo_diesel REAL NOT NULL DEFAULT 0,
    custo_arla REAL NOT NULL DEFAULT 0,
    custo_manutencao REAL NOT NULL DEFAULT 0,
    custo_depreciacao REAL NOT NULL DEFAULT 0,
    motorista REAL NOT NULL DEFAULT 0,
    pedagio REAL NOT NULL DEFAULT 0,
    imposto REAL NOT NULL DEFAULT 0,
    outros_custos REAL NOT NULL DEFAULT 0,
    custo_total REAL NOT NULL DEFAULT 0,
    lucro REAL NOT NULL DEFAULT 0,
    parte_paulo REAL NOT NULL DEFAULT 0,
    parte_rapha REAL NOT NULL DEFAULT 0,
    margem REAL NOT NULL DEFAULT 0,
    lucro_por_km REAL NOT NULL DEFAULT 0,
    status_acerto TEXT NOT NULL DEFAULT 'pendente',
    data_acerto TEXT,
    observacao TEXT,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
try {
  db.exec(`
    ALTER TABLE fretes
    ADD COLUMN arquivado INTEGER NOT NULL DEFAULT 0
  `);
} catch (erro) {
  if (!String(erro.message).includes("duplicate column name")) {
    throw erro;
  }
}
try {
  db.exec(`
    ALTER TABLE fretes
    ADD COLUMN origem_lancamento TEXT NOT NULL DEFAULT 'web'
  `);
} catch (erro) {
  if (!String(erro.message).includes("duplicate column name")) {
    throw erro;
  }
}
db.exec(`
  CREATE TABLE IF NOT EXISTS whatsapp_mensagens (
    message_id TEXT PRIMARY KEY,
    telefone TEXT,
    texto TEXT,
    frete_id INTEGER,
    criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);
db.exec(`
  CREATE TABLE IF NOT EXISTS whatsapp_conversas (
    telefone TEXT PRIMARY KEY,
    dados_json TEXT NOT NULL,
    campo_pendente TEXT,
    atualizado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )
`);

function numero(valor) {
  const n = Number(String(valor ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

function dinheiro(n) {
  return Number(n || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

function calcularFrete(dados = {}) {
  const frete = numero(dados.valor_frete);
  const ida = numero(dados.km_ida ?? dados.distancia);
  const tipoRetorno = dados.tipo_retorno || dados.tipoRetorno || "vazio";
  let volta = 0;

  if (tipoRetorno === "vazio") {
    volta = ida;
  } else if (tipoRetorno === "manual") {
    volta = numero(dados.km_volta);
  }

  const kmTotal = ida + volta;
  const consumoDiesel = numero(dados.consumo_diesel ?? dados.consumoDiesel ?? 2.5);
  const precoDiesel = numero(dados.preco_diesel ?? dados.precoDiesel ?? 6.6);
  const kmPorArla = numero(dados.km_por_arla ?? dados.kmPorArla ?? 12);
  const precoArla = numero(dados.preco_arla ?? dados.precoArla ?? 3.6);
  const manutencaoPct = numero(dados.manutencao_pct ?? dados.manutencaoPct ?? 10);
  const depreciacaoKm = numero(dados.depreciacao_km ?? dados.depreciacaoKm ?? 0.5);
  const motorista = numero(dados.motorista);
  const pedagio = numero(dados.pedagio);
  const impostoPct = numero(dados.imposto_pct ?? dados.impostoPct);
  const outrosCustos = numero(dados.outros_custos ?? dados.outrosCustos);

  const litrosDiesel = consumoDiesel > 0 ? kmTotal / consumoDiesel : 0;
  const custoDiesel = litrosDiesel * precoDiesel;
  const litrosArla = kmPorArla > 0 ? kmTotal / kmPorArla : 0;
  const custoArla = litrosArla * precoArla;
  const custoManutencao = frete * (manutencaoPct / 100);
  const custoDepreciacao = kmTotal * depreciacaoKm;
  const imposto = frete * (impostoPct / 100);
  const custoTotal = custoDiesel + custoArla + custoManutencao + custoDepreciacao + motorista + pedagio + imposto + outrosCustos;
  const lucro = frete - custoTotal;
  const partePaulo = lucro / 2;
  const parteRapha = lucro / 2;
  const margem = frete > 0 ? (lucro / frete) * 100 : 0;
  const lucroPorKm = kmTotal > 0 ? lucro / kmTotal : 0;

  return {
    data: dados.data || new Date().toISOString().slice(0, 10),
    origem: dados.origem || "",
    destino: dados.destino || "",
    valor_frete: frete,
    km_ida: ida,
    km_volta: volta,
    km_total: kmTotal,
    custo_diesel: custoDiesel,
    custo_arla: custoArla,
    custo_manutencao: custoManutencao,
    custo_depreciacao: custoDepreciacao,
    motorista,
    pedagio,
    imposto,
    outros_custos: outrosCustos,
    custo_total: custoTotal,
    lucro,
    parte_paulo: partePaulo,
    parte_rapha: parteRapha,
    margem,
    lucro_por_km: lucroPorKm,
    status_acerto: dados.status_acerto || "pendente",
    observacao: dados.observacao || "",
    origem_lancamento: dados.origem_lancamento || "web"
  };
}

function salvarFreteCalculado(dados) {
  const stmt = db.prepare(`
    INSERT INTO fretes (
      data,
      origem,
      destino,
      valor_frete,
      km_ida,
      km_volta,
      km_total,
      custo_diesel,
      custo_arla,
      custo_manutencao,
      custo_depreciacao,
      motorista,
      pedagio,
      imposto,
      outros_custos,
      custo_total,
      lucro,
      parte_paulo,
      parte_rapha,
      margem,
      lucro_por_km,
      status_acerto,
      observacao,
      origem_lancamento
    )
    VALUES (
      @data,
      @origem,
      @destino,
      @valor_frete,
      @km_ida,
      @km_volta,
      @km_total,
      @custo_diesel,
      @custo_arla,
      @custo_manutencao,
      @custo_depreciacao,
      @motorista,
      @pedagio,
      @imposto,
      @outros_custos,
      @custo_total,
      @lucro,
      @parte_paulo,
      @parte_rapha,
      @margem,
      @lucro_por_km,
      @status_acerto,
      @observacao,
      @origem_lancamento
    )
  `);

  return stmt.run(dados);
}

app.get("/api/fretes", (req, res) => {
  const fretes = db
    .prepare(`
      SELECT *
      FROM fretes
      WHERE COALESCE(arquivado, 0) = 0
      ORDER BY data DESC, id DESC
    `)
    .all();

  res.json(fretes);
});

app.post("/api/fretes", (req, res) => {
  const body = req.body || {};

  const dados = {
    data: body.data || new Date().toISOString().slice(0, 10),
    origem: body.origem || "",
    destino: body.destino || "",
    valor_frete: numero(body.valor_frete),
    km_ida: numero(body.km_ida),
    km_volta: numero(body.km_volta),
    km_total: numero(body.km_total),
    custo_diesel: numero(body.custo_diesel),
    custo_arla: numero(body.custo_arla),
    custo_manutencao: numero(body.custo_manutencao),
    custo_depreciacao: numero(body.custo_depreciacao),
    motorista: numero(body.motorista),
    pedagio: numero(body.pedagio),
    imposto: numero(body.imposto),
    outros_custos: numero(body.outros_custos),
    custo_total: numero(body.custo_total),
    lucro: numero(body.lucro),
    parte_paulo: numero(body.parte_paulo),
    parte_rapha: numero(body.parte_rapha),
    margem: numero(body.margem),
    lucro_por_km: numero(body.lucro_por_km),
    status_acerto: body.status_acerto || "pendente",
    observacao: body.observacao || "",
    origem_lancamento: body.origem_lancamento || "web"
  };

  const result = salvarFreteCalculado(dados);

  res.json({
    ok: true,
    id: result.lastInsertRowid
  });
});

app.patch("/api/fretes/:id/acerto", (req, res) => {
  const id = Number(req.params.id);
  const body = req.body || {};
  const status = body.status_acerto === "acertado" ? "acertado" : "pendente";
  const dataAcerto = status === "acertado"
    ? (body.data_acerto || new Date().toISOString().slice(0, 10))
    : null;

  db.prepare(`
    UPDATE fretes
    SET status_acerto = ?, data_acerto = ?
    WHERE id = ?
  `).run(status, dataAcerto, id);

  res.json({ ok: true });
});

app.patch("/api/fretes/acertar-pendentes", (req, res) => {
  const dataAcerto = new Date().toISOString().slice(0, 10);

  const result = db.prepare(`
    UPDATE fretes
    SET status_acerto = 'acertado',
        data_acerto = ?
    WHERE status_acerto = 'pendente'
  `).run(dataAcerto);

  res.json({
    ok: true,
    alterados: result.changes
  });
});
app.patch("/api/fretes/:id/arquivar", (req, res) => {
  const id = Number(req.params.id);

  db.prepare(`
    UPDATE fretes
    SET arquivado = 1
    WHERE id = ?
  `).run(id);

  res.json({ ok: true });
});

app.delete("/api/fretes/:id", (req, res) => {
  const id = Number(req.params.id);

  db.prepare("DELETE FROM fretes WHERE id = ?").run(id);

  res.json({ ok: true });
});

function numeroTexto(valor) {
  if (!valor) return 0;
  const limpo = String(valor)
    .replace(/\s/g, "")
    .replace(/\.(?=\d{3}(?:\D|$))/g, "")
    .replace(",", ".");
  return numero(limpo);
}

function extrairNumero(texto, regex) {
  const match = texto.match(regex);
  return match ? numeroTexto(match[1]) : 0;
}

function extrairPrimeiroNumero(texto) {
  return extrairNumero(String(texto || ""), /([0-9][0-9.\s]*(?:,\d+)?)/);
}

function extrairDadosMensagemFrete(textoOriginal = "") {
  const texto = String(textoOriginal || "").trim();
  const rota = texto.match(/frete\s+de\s+(.+?)\s+para\s+(.+?)(?:,|\.|\s+valor|\s+dist[aâ]ncia|\s+diesel|\s+consumo|\s+ped[aá]gio|$)/i);
  const informouPedagio = /ped\S*/i.test(texto);

  return {
    origem: rota ? rota[1].trim() : "",
    destino: rota ? rota[2].trim() : "",
    valor_frete: extrairNumero(texto, /(?:valor|frete recebido|frete)\s*(?:de|r\$|=|:)?\s*([0-9][0-9.\s]*(?:,\d+)?)/i),
    km_ida: extrairNumero(texto, /dist\S*\s*(?:de|aproximada|=|:)?\s*([0-9][0-9.\s]*(?:,\d+)?)\s*(?:km)?/i),
    preco_diesel: extrairNumero(texto, /diesel\s*(?:a|de|r\$|=|:)?\s*([0-9][0-9.\s]*(?:,\d+)?)/i),
    consumo_diesel: extrairNumero(texto, /consumo\s*(?:de|=|:)?\s*([0-9][0-9.\s]*(?:,\d+)?)\s*(?:km\/l|km por litro)?/i),
    pedagio: extrairNumero(texto, /ped\S*\s*(?:de|r\$|=|:)?\s*([0-9][0-9.\s]*(?:,\d+)?)/i),
    informou_pedagio: informouPedagio
  };
}

function proximaPerguntaDadosFaltantes(dados) {
  if (!dados.origem) return "Entendi. Para calcular melhor, me informe a origem do frete.";
  if (!dados.destino) return "Entendi. Para calcular melhor, me informe o destino do frete.";
  if (!dados.valor_frete) return "Entendi. Para calcular melhor, me informe o valor do frete.";
  if (!dados.km_ida) return "Entendi. Para calcular melhor, me informe a distância aproximada em km.";
  if (!dados.preco_diesel) return "Entendi. Para calcular melhor, me informe o preço do diesel.";
  if (!dados.consumo_diesel) return "Entendi. Para calcular melhor, me informe o consumo do caminhão em km/l.";
  if (!dados.informou_pedagio) return "Entendi. Para calcular melhor, me informe o valor do pedágio.";
  return "";
}

function proximoDadoFaltanteMemoria(dados) {
  if (!dados.origem) {
    return { campo: "origem", pergunta: "Entendi. Para calcular melhor, me informe a origem do frete." };
  }
  if (!dados.destino) {
    return { campo: "destino", pergunta: "Entendi. Para calcular melhor, me informe o destino do frete." };
  }
  if (!dados.valor_frete) {
    return { campo: "valor_frete", pergunta: "Entendi. Para calcular melhor, me informe o valor do frete." };
  }
  if (!dados.km_ida) {
    return { campo: "km_ida", pergunta: "Entendi. Para calcular melhor, me informe a distancia aproximada em km." };
  }
  if (!dados.preco_diesel) {
    return { campo: "preco_diesel", pergunta: "Entendi. Para calcular melhor, me informe o preco do diesel." };
  }
  if (!dados.consumo_diesel) {
    return { campo: "consumo_diesel", pergunta: "Entendi. Para calcular melhor, me informe o consumo do caminhao em km/l." };
  }
  if (!dados.informou_pedagio) {
    return { campo: "pedagio", pergunta: "Entendi. Para calcular melhor, me informe o valor do pedagio." };
  }
  return null;
}

function classificarFrete(calculo) {
  if (calculo.lucro <= 0 || calculo.margem < 5) {
    return {
      texto: "RUIM",
      recomendacao: "Esse frete parece ruim. Negocie melhor ou confira se existe retorno para compensar."
    };
  }
  if (calculo.margem < 15) {
    return {
      texto: "APERTADO",
      recomendacao: "Esse frete exige negociação. A margem está apertada."
    };
  }
  if (calculo.margem < 30) {
    return {
      texto: "BOM",
      recomendacao: "Esse frete parece viável, mas ainda vale conferir diesel, pedágio e retorno."
    };
  }
  return {
    texto: "ÓTIMO",
    recomendacao: "Esse frete parece bem viável pelos números informados."
  };
}

function montarRespostaFrete(calculo) {
  const classificacao = classificarFrete(calculo);

  return [
    "Resultado do frete:",
    "",
    `Origem: ${calculo.origem || "-"}`,
    `Destino: ${calculo.destino || "-"}`,
    `Valor do frete: ${dinheiro(calculo.valor_frete)}`,
    `Custo estimado: ${dinheiro(calculo.custo_total)}`,
    `Lucro estimado: ${dinheiro(calculo.lucro)}`,
    `Lucro por km: ${dinheiro(calculo.lucro_por_km)}/km`,
    `Classificação: ${classificacao.texto}`,
    "",
    `Recomendação: ${classificacao.recomendacao}`
  ].join("\n");
}

async function sendWhatsAppMessage(to, text) {
  const apiVersion = process.env.WHATSAPP_API_VERSION;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;

  if (!apiVersion || !phoneNumberId || !accessToken) {
    throw new Error("Variáveis do WhatsApp não configuradas.");
  }

  const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text }
    })
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("Erro ao enviar WhatsApp:", response.status, body);
    throw new Error("Erro ao enviar mensagem pelo WhatsApp.");
  }

  return response.json();
}

function buscarMensagemWhatsApp(messageId) {
  if (!messageId) return null;
  return db
    .prepare("SELECT * FROM whatsapp_mensagens WHERE message_id = ?")
    .get(messageId);
}

function registrarMensagemWhatsApp({ messageId, telefone, texto, freteId = null }) {
  if (!messageId) return;
  db.prepare(`
    INSERT OR IGNORE INTO whatsapp_mensagens (
      message_id,
      telefone,
      texto,
      frete_id
    )
    VALUES (?, ?, ?, ?)
  `).run(messageId, telefone || "", texto || "", freteId);
}

function atualizarFreteMensagemWhatsApp(messageId, freteId) {
  if (!messageId || !freteId) return;
  db.prepare(`
    UPDATE whatsapp_mensagens
    SET frete_id = ?
    WHERE message_id = ?
  `).run(freteId, messageId);
}

function carregarConversaWhatsApp(telefone) {
  if (!telefone) return null;
  const row = db
    .prepare("SELECT * FROM whatsapp_conversas WHERE telefone = ?")
    .get(telefone);
  if (!row) return null;

  try {
    return {
      telefone: row.telefone,
      campo_pendente: row.campo_pendente || "",
      dados: JSON.parse(row.dados_json || "{}")
    };
  } catch {
    return null;
  }
}

function salvarConversaWhatsApp(telefone, dados, campoPendente) {
  if (!telefone) return;
  db.prepare(`
    INSERT INTO whatsapp_conversas (
      telefone,
      dados_json,
      campo_pendente,
      atualizado_em
    )
    VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(telefone) DO UPDATE SET
      dados_json = excluded.dados_json,
      campo_pendente = excluded.campo_pendente,
      atualizado_em = CURRENT_TIMESTAMP
  `).run(telefone, JSON.stringify(dados || {}), campoPendente || "");
}

function limparConversaWhatsApp(telefone) {
  if (!telefone) return;
  db.prepare("DELETE FROM whatsapp_conversas WHERE telefone = ?").run(telefone);
}

function temDadosExtraidos(dados) {
  return Boolean(
    dados.origem ||
    dados.destino ||
    dados.valor_frete ||
    dados.km_ida ||
    dados.preco_diesel ||
    dados.consumo_diesel ||
    dados.informou_pedagio
  );
}

function extrairJsonObjeto(texto) {
  const limpo = String(texto || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();
  const inicio = limpo.indexOf("{");
  const fim = limpo.lastIndexOf("}");

  if (inicio < 0 || fim < inicio) return null;

  try {
    return JSON.parse(limpo.slice(inicio, fim + 1));
  } catch (error) {
    console.error("Nao consegui ler o JSON da IA:", error.message);
    return null;
  }
}

function normalizarDadosFreteIA(dados = {}) {
  const pedagio = dados.pedagio === null || dados.pedagio === undefined ? 0 : numero(dados.pedagio);
  const informouPedagio = Boolean(dados.informou_pedagio) || pedagio > 0;

  return {
    origem: typeof dados.origem === "string" ? dados.origem.trim() : "",
    destino: typeof dados.destino === "string" ? dados.destino.trim() : "",
    valor_frete: numero(dados.valor_frete),
    km_ida: numero(dados.km_ida ?? dados.distancia),
    preco_diesel: numero(dados.preco_diesel),
    consumo_diesel: numero(dados.consumo_diesel),
    pedagio,
    informou_pedagio: informouPedagio
  };
}

async function interpretarFreteComIA({ mensagem, dadosAtuais = {}, campoPendente = "" }) {
  if (!process.env.OPENAI_API_KEY || !String(mensagem || "").trim()) {
    return { usada: false, dados: {} };
  }

  const prompt = `
Voce e um extrator de dados para uma calculadora de frete de caminhao.

Sua tarefa e transformar a mensagem do motorista em JSON.
Nao calcule lucro, custo, margem, diesel total ou recomendacao.
Se um dado nao estiver claro, use null.
Se o motorista responder apenas um numero e houver campo_pendente, use esse numero para esse campo.
Para pedagio: se o motorista disser que nao tem pedagio, use pedagio 0 e informou_pedagio true.
Responda somente com JSON valido, sem texto antes ou depois.

Campos esperados:
{
  "origem": string|null,
  "destino": string|null,
  "valor_frete": number|null,
  "km_ida": number|null,
  "preco_diesel": number|null,
  "consumo_diesel": number|null,
  "pedagio": number|null,
  "informou_pedagio": boolean,
  "confianca": number,
  "observacoes": string[]
}

Dados que ja estavam no rascunho:
${JSON.stringify(dadosAtuais || {})}

Campo pendente:
${campoPendente || "nenhum"}

Mensagem do motorista:
${String(mensagem || "").slice(0, 1200)}
`;

  try {
    const resposta = await openai.responses.create({
      model: process.env.OPENAI_MODEL_WHATSAPP || "gpt-4.1-mini",
      input: prompt
    });
    const json = extrairJsonObjeto(resposta.output_text);
    const dados = json ? normalizarDadosFreteIA(json) : {};

    console.log("IA interpretou mensagem WhatsApp:", {
      usada: true,
      campos: dados,
      confianca: json?.confianca ?? null
    });

    return {
      usada: true,
      dados,
      confianca: json?.confianca ?? null,
      observacoes: Array.isArray(json?.observacoes) ? json.observacoes : []
    };
  } catch (error) {
    console.error("Erro ao interpretar WhatsApp com IA:", error.message);
    return { usada: false, dados: {}, erro: error.message };
  }
}

function mesclarDadosFrete(base, novos) {
  const dados = { ...(base || {}) };
  if (novos.origem) dados.origem = novos.origem;
  if (novos.destino) dados.destino = novos.destino;
  if (novos.valor_frete) dados.valor_frete = novos.valor_frete;
  if (novos.km_ida) dados.km_ida = novos.km_ida;
  if (novos.preco_diesel) dados.preco_diesel = novos.preco_diesel;
  if (novos.consumo_diesel) dados.consumo_diesel = novos.consumo_diesel;
  if (novos.informou_pedagio) {
    dados.pedagio = novos.pedagio;
    dados.informou_pedagio = true;
  }
  return dados;
}

function extrairRespostaCampoPendente(campo, mensagem) {
  const texto = String(mensagem || "").trim();
  const numeroResposta = extrairPrimeiroNumero(texto);

  if (campo === "origem") return { origem: texto };
  if (campo === "destino") return { destino: texto };
  if (campo === "valor_frete") return { valor_frete: numeroResposta };
  if (campo === "km_ida") return { km_ida: numeroResposta };
  if (campo === "preco_diesel") return { preco_diesel: numeroResposta };
  if (campo === "consumo_diesel") return { consumo_diesel: numeroResposta };
  if (campo === "pedagio") {
    return { pedagio: numeroResposta, informou_pedagio: true };
  }
  return {};
}

async function processarMensagemWhatsApp({ telefone, mensagem, messageId = "", salvar = true }) {
  console.log("WhatsApp recebido:", {
    telefone,
    messageId,
    texto: mensagem
  });

  const mensagemExistente = buscarMensagemWhatsApp(messageId);
  if (mensagemExistente) {
    console.log("Mensagem WhatsApp duplicada ignorada:", {
      messageId,
      frete_id: mensagemExistente.frete_id
    });
    return {
      duplicada: true,
      completo: true,
      salvo: false,
      id: mensagemExistente.frete_id,
      resposta: ""
    };
  }

  if (salvar && messageId) {
    registrarMensagemWhatsApp({ messageId, telefone, texto: mensagem });
  }

  if (/^(cancelar|limpar|recomeçar|recomecar)$/i.test(String(mensagem || "").trim())) {
    limparConversaWhatsApp(telefone);
    return {
      completo: false,
      cancelada: true,
      resposta: "Certo, apaguei o rascunho desse frete. Pode me mandar um novo frete quando quiser."
    };
  }

  const dadosExtraidos = extrairDadosMensagemFrete(mensagem);
  console.log("Dados extraídos do WhatsApp:", dadosExtraidos);

  const conversa = carregarConversaWhatsApp(telefone);
  const dadosComplementares = conversa?.campo_pendente && !temDadosExtraidos(dadosExtraidos)
    ? extrairRespostaCampoPendente(conversa.campo_pendente, mensagem)
    : {};
  let dadosMesclados = mesclarDadosFrete(
    mesclarDadosFrete(conversa?.dados || {}, dadosExtraidos),
    dadosComplementares
  );
  console.log("Dados acumulados da conversa:", {
    telefone,
    campo_pendente_anterior: conversa?.campo_pendente || "",
    dados: dadosMesclados
  });

  let interpretacaoIA = { usada: false, dados: {} };
  let proximo = proximoDadoFaltanteMemoria(dadosMesclados);
  const deveTentarIA = proximo || (!conversa?.campo_pendente && !temDadosExtraidos(dadosExtraidos));

  if (deveTentarIA) {
    interpretacaoIA = await interpretarFreteComIA({
      mensagem,
      dadosAtuais: dadosMesclados,
      campoPendente: conversa?.campo_pendente || proximo?.campo || ""
    });

    if (interpretacaoIA.usada && temDadosExtraidos(interpretacaoIA.dados)) {
      dadosMesclados = mesclarDadosFrete(dadosMesclados, interpretacaoIA.dados);
      proximo = proximoDadoFaltanteMemoria(dadosMesclados);
      console.log("Dados acumulados apos IA:", {
        telefone,
        dados: dadosMesclados
      });
    }
  }

  const pergunta = proximo ? proximo.pergunta : "";
  if (pergunta) {
    salvarConversaWhatsApp(telefone, dadosMesclados, proximo.campo);
    return {
      completo: false,
      campo_pendente: proximo.campo,
      dados_extraidos: dadosMesclados,
      ia_usada: interpretacaoIA.usada,
      resposta: pergunta
    };
  }

  const calculo = calcularFrete({
    ...dadosMesclados,
    tipo_retorno: "vazio",
    origem_lancamento: "whatsapp",
    observacao: `Lançado via WhatsApp pelo telefone ${telefone || "-"}`
  });
  const resposta = montarRespostaFrete(calculo);
  let id = null;

  if (salvar) {
    const result = salvarFreteCalculado(calculo);
    id = result.lastInsertRowid;
    atualizarFreteMensagemWhatsApp(messageId, id);
  }
  limparConversaWhatsApp(telefone);

  console.log("Resultado do cálculo WhatsApp:", {
    id,
    origem: calculo.origem,
    destino: calculo.destino,
    valor_frete: calculo.valor_frete,
    custo_total: calculo.custo_total,
    lucro: calculo.lucro,
    margem: calculo.margem
  });

  return {
    completo: true,
    salvo: Boolean(id),
    id,
    dados_extraidos: dadosMesclados,
    ia_usada: interpretacaoIA.usada,
    calculo,
    resposta
  };
}

app.get("/webhook/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

app.get("/api/whatsapp/status", (req, res) => {
  res.json({
    ok: true,
    webhook: "/webhook/whatsapp",
    verify_token_configurado: Boolean(process.env.WHATSAPP_VERIFY_TOKEN),
    access_token_configurado: Boolean(process.env.WHATSAPP_ACCESS_TOKEN),
    phone_number_id_configurado: Boolean(process.env.WHATSAPP_PHONE_NUMBER_ID),
    api_version: process.env.WHATSAPP_API_VERSION || null
  });
});

app.post("/webhook/whatsapp", async (req, res) => {
  try {
    const entries = req.body?.entry || [];

    for (const entry of entries) {
      const changes = entry.changes || [];
      for (const change of changes) {
        const value = change.value || {};
        const messages = value.messages || [];
        for (const message of messages) {
          if (message.type !== "text") continue;

          const telefone = message.from;
          const texto = message.text?.body || "";
          const resultado = await processarMensagemWhatsApp({
            telefone,
            mensagem: texto,
            messageId: message.id || "",
            salvar: true
          });

          if (!resultado.duplicada && resultado.resposta) {
            await sendWhatsAppMessage(telefone, resultado.resposta);
          }
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Erro no webhook do WhatsApp:", error.message);
    res.sendStatus(200);
  }
});

app.post("/api/whatsapp/teste", async (req, res) => {
  try {
    const body = req.body || {};
    const resultado = await processarMensagemWhatsApp({
      telefone: body.telefone || "teste",
      mensagem: body.mensagem || "",
      messageId: body.message_id || "",
      salvar: body.salvar === true
    });

    res.json({
      ok: true,
      telefone: body.telefone || "teste",
      mensagem_recebida: body.mensagem || "",
      ...resultado
    });
  } catch (error) {
    console.error("Erro no teste WhatsApp:", error);
    res.status(500).json({
      ok: false,
      erro: "Erro ao testar mensagem de WhatsApp."
    });
  }
});
app.post("/api/analisar-frete", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        ok: false,
        erro: "OPENAI_API_KEY não configurada no ambiente."
      });
    }

    const frete = req.body || {};

    const prompt = `
Você é um consultor operacional de transporte rodoviário de cargas.

Analise o frete abaixo com base nos números calculados pelo sistema.
Não refaça os cálculos principais. Use os valores fornecidos.
Se algum número parecer ruim ou incoerente, aponte como ponto de atenção.

Dados do frete:
- Data: ${frete.data || "-"}
- Origem: ${frete.origem || "-"}
- Destino: ${frete.destino || "-"}
- Frete recebido: R$ ${frete.valor_frete || 0}
- KM ida: ${frete.km_ida || 0}
- KM volta considerada: ${frete.km_volta || 0}
- KM total: ${frete.km_total || 0}
- Custo diesel: R$ ${frete.custo_diesel || 0}
- Custo ARLA: R$ ${frete.custo_arla || 0}
- Custo manutenção: R$ ${frete.custo_manutencao || 0}
- Custo depreciação: R$ ${frete.custo_depreciacao || 0}
- Pedágio: R$ ${frete.pedagio || 0}
- Outros custos: R$ ${frete.outros_custos || 0}
- Custo total: R$ ${frete.custo_total || 0}
- Lucro líquido: R$ ${frete.lucro || 0}
- Margem: ${frete.margem || 0}%
- Lucro por km: R$ ${frete.lucro_por_km || 0}
- Parte Paulo 50%: R$ ${frete.parte_paulo || 0}
- Parte Rapha 50%: R$ ${frete.parte_rapha || 0}

Responda em português do Brasil, com linguagem simples, direta e prática, como se estivesse explicando para um caminhoneiro e para o dono do caminhão.

Não use linguagem de consultoria.
Não faça texto longo.
Não use muitos termos técnicos.
Não diga "margem considerada boa para o mercado", a menos que tenha certeza.
Não invente média de mercado.
Não refaça os cálculos.
Use os números fornecidos pelo sistema.
Considere que o consumo de ARLA informado pelo usuário é uma premissa operacional válida.
Não critique o custo de ARLA apenas por parecer alto.
Só alerte sobre ARLA se o valor estiver zerado, negativo ou claramente incompatível com os dados informados.
Não comente manutenção e depreciação se os valores estiverem apenas sendo usados como parâmetros normais do cálculo.
Só mencione manutenção, depreciação, diesel, ARLA ou pedágio quando algum deles for claramente o principal motivo de o frete estar ruim, apertado ou exigir atenção.
Evite frases genéricas como "mantenha registro para evitar surpresas".
Use exatamente esta estrutura curta:

Resumo do frete
Diga em uma frase se o frete está bom, aceitável, apertado ou ruim.

Números principais
Mostre:
- Frete recebido
- Custo total
- Lucro líquido
- Paulo fica com
- Rapha fica com

Ponto de atenção
Fale no máximo dois pontos que merecem cuidado.

Sugestão prática
Dê uma orientação simples: aceitar, negociar melhor, conferir custos ou buscar retorno.

Escreva no máximo 12 linhas.
`;

    const resposta = await openai.responses.create({
      model: "gpt-4.1-mini",
      input: prompt
    });

    res.json({
      ok: true,
      analise: resposta.output_text
    });
  } catch (error) {
    console.error("Erro ao analisar frete com IA:", error);

    res.status(500).json({
      ok: false,
      erro: "Erro ao analisar o frete com IA."
    });
  }
});
app.listen(PORT, () => {
  console.log(`Calculadora rodando em http://localhost:${PORT}`);
});
