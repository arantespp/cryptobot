import path from 'path';

export const isProduction = process.env.NODE_ENV === 'production';

const envPath = path.join(
  process.cwd(),
  `.env${isProduction ? '.production' : ''}`
);

require('dotenv').config({ path: envPath });
