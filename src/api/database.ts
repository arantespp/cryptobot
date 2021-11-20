import {
  DynamoDBClient,
  GetItemCommand,
  PutItemCommand,
  UpdateItemCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

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

type PrimaryKey = {
  pk: string;
  sk: string;
};

type Item = PrimaryKey & { [key: string]: any };

export const putItem = async ({ item }: { item: Item }) => {
  const putItemCommand = new PutItemCommand({
    TableName: TABLE_NAME,
    Item: marshall(item),
  });

  return dynamoDb.send(putItemCommand);
};

export const getItem = async <I extends Partial<Item>>(key: PrimaryKey) => {
  const getItemCommand = new GetItemCommand({
    TableName: TABLE_NAME,
    Key: marshall(key),
  });

  const { Item = {} } = await dynamoDb.send(getItemCommand);

  return unmarshall(Item) as I;
};

export const updateItem = async <I extends Partial<Item>>({
  key,
  updateExpression,
  expressionAttributeValues,
}: {
  key: PrimaryKey;
  updateExpression: string;
  expressionAttributeValues: { [key: string]: any };
}) => {
  const updateItemCommand = new UpdateItemCommand({
    TableName: TABLE_NAME,
    Key: marshall(key),
    UpdateExpression: updateExpression,
    ReturnValues: 'ALL_NEW',
    ExpressionAttributeValues: marshall(expressionAttributeValues),
  });

  const { Attributes = {} } = await dynamoDb.send(updateItemCommand);

  return unmarshall(Attributes) as I;
};
