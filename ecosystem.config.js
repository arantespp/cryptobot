module.exports = {
  apps: [
    {
      name: 'CryptoBot',
      script: 'dist/index.js',
      watch: ['dist/index.js'],
      watch_delay: 1000,
      time: true,
      env_production: {
        NODE_ENV: 'production',
      },
    },
  ],
};
