function normalizeEmail(value) {
  if (typeof value !== 'string') return null;

  const email = value.trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return null;
  }

  return email;
}

function normalizePhone(value) {
  if (typeof value !== 'string') return null;

  const compact = value.trim().replace(/[\s()-]/g, '');
  if (/^0\d{9}$/.test(compact)) return `+254${compact.slice(1)}`;
  if (/^254\d{9}$/.test(compact)) return `+${compact}`;
  if (/^\+[1-9]\d{6,14}$/.test(compact)) return compact;
  if (/^[1-9]\d{6,14}$/.test(compact)) return `+${compact}`;
  return null;
}

function phoneLookupCandidates(value) {
  if (typeof value !== 'string') return [];

  const exact = value.trim();
  const normalized = normalizePhone(exact);
  const kenyanVariants = normalized && /^\+254\d{9}$/.test(normalized)
    ? [`0${normalized.slice(4)}`, normalized.slice(1)]
    : [];
  return [...new Set([normalized, exact, ...kenyanVariants].filter(Boolean))];
}

const PUBLIC_ROLE_ALIASES = {
  buyer: 'BUYER',
  farmer: 'FARMER',
  consumer: 'CONSUMER',
  cooperative: 'COOPERATIVE_STAFF',
  cooperative_staff: 'COOPERATIVE_STAFF',
};

function normalizePublicRole(value) {
  if (typeof value !== 'string') return null;
  return PUBLIC_ROLE_ALIASES[value.trim().toLowerCase()] || null;
}

module.exports = {
  normalizeEmail,
  normalizePhone,
  phoneLookupCandidates,
  normalizePublicRole,
};
