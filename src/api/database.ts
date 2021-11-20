import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';

const { AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY } = process.env;

if (!AWS_ACCESS_KEY_ID) {
  throw new Error('AWS_ACCESS_KEY_ID is not set');
}

if (!AWS_SECRET_ACCESS_KEY) {
  throw new Error('AWS_SECRET_ACCESS_KEY is not set');
}

const TABLE_NAME = 'CryptoBot';

const dynamoDb = new DynamoDBClient({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

export const putTransaction = async () => {
  const putItemCommand = new PutItemCommand({
    TableName: TABLE_NAME,
    Item: {
      pk: { S: 'test' },
      sk: { S: 'test' },
      asd: { S: 'test' },
    },
  });

  const data = await dynamoDb.send(putItemCommand);

  return data;
};
