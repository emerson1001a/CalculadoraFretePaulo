const express = require("express");
const Database = require("better-sqlite3");
const path = require("path");

const app = express();
const PORT = 3010;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const db = new Database(path.join(__dirname, "fretes.db"));

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

app.listen(PORT, () => {
  console.log(`Calculadora rodando em http://localhost:${PORT}`);
});