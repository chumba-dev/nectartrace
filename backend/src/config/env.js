require('dotenv').config();

module.exports = {
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',

  database: {
    url: process.env.DATABASE_URL,
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },

  africasTalking: {
    apiKey: process.env.AT_API_KEY,
    username: process.env.AT_USERNAME || 'sandbox',
    shortcode: process.env.AT_SHORTCODE || '*483#',
  },

  blockchain: {
    rpcUrl: process.env.POLYGON_AMOY_RPC_URL || process.env.RPC_URL,
    privateKey: process.env.POLYGON_AMOY_PRIVATE_KEY || process.env.PRIVATE_KEY,
    contractAddress: process.env.CONTRACT_ADDRESS,
  },

  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true',
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM,
  },

  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
  },

  emailVerification: {
    ttlMinutes: Number(process.env.EMAIL_VERIFICATION_TTL_MINUTES) || 60,
  },
};
