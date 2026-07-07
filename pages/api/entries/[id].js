import { sql } from '@vercel/postgres';

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
  const { id } = req.query;

  try {
    if (req.method === 'PUT') {
      const { date, client, type, hours, amount, vatApplies, vatRate, vatAmount, total, desc } = req.body || {};
      const { rows } = await sql`
        UPDATE entries SET
          date = ${date},
          client = ${client},
          type = ${type},
          hours = ${hours},
          amount = ${amount},
          vat_applies = ${!!vatApplies},
          vat_rate = ${vatRate},
          vat_amount = ${vatAmount},
          total = ${total},
          description = ${desc}
        WHERE id = ${id}
        RETURNING *`;
      if (!rows[0]) return res.status(404).json({ error: 'Not found' });
      return res.status(200).json(toClient(rows[0]));
    }

    if (req.method === 'DELETE') {
      await sql`DELETE FROM entries WHERE id = ${id}`;
      return res.status(204).end();
    }

    res.setHeader('Allow', ['PUT', 'DELETE']);
    return res.status(405).end('Method Not Allowed');
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error', detail: String(err && err.message) });
  }
}
