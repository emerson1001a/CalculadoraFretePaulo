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

function numero(valor) {
  const n = Number(valor);
  return Number.isFinite(n) ? n : 0;
}

app.get("/api/fretes", (req, res) => {
  const fretes = db
    .prepare("SELECT * FROM fretes ORDER BY data DESC, id DESC")
    .all();

  res.json(fretes);
});

app.post("/api/fretes", (req, res) => {
  const body = req.body || {};

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
      observacao
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
      @observacao
    )
  `);

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
    observacao: body.observacao || ""
  };

  const result = stmt.run(dados);

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

app.delete("/api/fretes/:id", (req, res) => {
  const id = Number(req.params.id);

  db.prepare("DELETE FROM fretes WHERE id = ?").run(id);

  res.json({ ok: true });
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