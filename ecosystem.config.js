module.exports = {
  apps: [
    {
      name: 'CryptoBot',
      script: 'dist/index.js',
      watch: ['dist/index.js'],
      time: true,
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
