set -e

SERVER_IP=54.161.159.172

yarn run test
yarn run build
yarn run release
scp -i ~/.ssh/arantespp-personal-aws.pem -r ./dist/* ubuntu@$SERVER_IP:~/cryptobot/dist/
scp -i ~/.ssh/arantespp-personal-aws.pem -r ./src/* ubuntu@$SERVER_IP:~/cryptobot/src/
scp -i ~/.ssh/arantespp-personal-aws.pem -r ./scripts/* ubuntu@$SERVER_IP:~/cryptobot/scripts/
scp -i ~/.ssh/arantespp-personal-aws.pem package.json .env.production ecosystem.config.js tsconfig.json ubuntu@$SERVER_IP:~/cryptobot