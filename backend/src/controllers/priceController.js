const prisma = require('../config/db');

async function getCurrentPrice(req, res, next) {
  try {
    const latest = await prisma.priceHistory.findFirst({
      where: { grade: 'A' },
      orderBy: { recordedAt: 'desc' },
    });
    res.json({
      success: true,
      data: {
        gradeA: latest?.pricePerKg || 750,
        gradeB: 550,
        currency: 'KES',
        perKg: true,
        lastUpdated: latest?.recordedAt || new Date().toISOString(),
      },
    });
  } catch (err) { next(err); }
}

async function getPriceHistory(req, res, next) {
  try {
    const { days = 30 } = req.query;
    const since = new Date();
    since.setDate(since.getDate() - parseInt(days));

    const history = await prisma.priceHistory.findMany({
      where: { recordedAt: { gte: since } },
      orderBy: { recordedAt: 'asc' },
    });
    res.json({ success: true, data: history });
  } catch (err) { next(err); }
}

module.exports = { getCurrentPrice, getPriceHistory };