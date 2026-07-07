import { sql } from '@vercel/postgres';

async function ensureTable() {
  await sql`CREATE TABLE IF NOT EXISTS entries (
    id SERIAL PRIMARY KEY,
    date TEXT NOT NULL,
    client TEXT,
    type TEXT,
    hours DOUBLE PRECISION,
    amount DOUBLE PRECISION,
    vat_applies BOOLEAN,
    vat_rate DOUBLE PRECISION,
    vat_amount DOUBLE PRECISION,
    total DOUBLE PRECISION,
    description TEXT,
    created_at TIMESTAMP DEFAULT NOW()
  )`;
}

function toClient(r) {
  return {
    id: r.id,
    date: r.date,
    client: r.client,
    type: r.type,
    hours: r.hours,
    amount: r.amount,
    vatApplies: r.vat_applies,
    vatRate: r.vat_rate,
    vatAmount: r.vat_amount,
    total: r.total,
    desc: r.description,
  };
}

export default async function handler(req, res) {
  try {
    await ensureTable();

    if (req.method === 'GET') {
      const { rows } = await sql`SELECT * FROM entries ORDER BY date DESC, id DESC`;
      return res.status(200).json(rows.map(toClient));
    }

    if (req.method === 'POST') {
      const { date, client, type, hours, amount, vatApplies, vatRate, vatAmount, total, desc } = req.body || {};
      const { rows } = await sql`
        INSERT INTO entries (date, client, type, hours, amount, vat_applies, vat_rate, vat_amount, total, description)
        VALUES (${date}, ${client}, ${type}, ${hours}, ${amount}, ${!!vatApplies}, ${vatRate}, ${vatAmount}, ${total}, ${desc})
        RETURNING *`;
      return res.status(200).json(toClient(rows[0]));
    }

    res.setHeader('Allow', ['GET', 'POST']);
    return res.status(405).end('Method Not Allowed');
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error', detail: String(err && err.message) });
  }
}
