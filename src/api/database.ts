import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';

const {
  AWS_REGION,
  AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY,
  DYNAMODB_TABLE_NAME,
} = process.env;

if (!AWS_ACCESS_KEY_ID) {
  throw new Error('AWS_ACCESS_KEY_ID is not set');
}

if (!AWS_SECRET_ACCESS_KEY) {
  throw new Error('AWS_SECRET_ACCESS_KEY is not set');
}

export const indexes = {
  pkStatusIndex: 'pk-status-index',
};

const TABLE_NAME = DYNAMODB_TABLE_NAME;

const dynamoDb = new DynamoDBClient({
  region: AWS_REGION,
  credentials: {
    accessKeyId: AWS_ACCESS_KEY_ID,
    secretAccessKey: AWS_SECRET_ACCESS_KEY,
  },
});

type Item = { pk: string; sk: string; [key: string]: any };

export const putItem = async ({ item }: { item: Item }) => {
  const putItemCommand = new PutItemCommand({
    TableName: TABLE_NAME,
    Item: marshall(item),
  });

  return dynamoDb.send(putItemCommand);
};
