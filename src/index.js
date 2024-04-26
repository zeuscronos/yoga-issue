import { makeExecutableSchema } from '@graphql-tools/schema';
import dotenv from 'dotenv';
import express from 'express';
import { PubSub } from 'graphql-subscriptions';
import { gql } from 'graphql-tag';
import { createYoga } from 'graphql-yoga';
import { createServer } from 'http';

dotenv.config();

const app = express();
const httpServer = createServer(app);

const pubsub = new PubSub();

const NOTIFICATION_CHANNEL_MESSAGE = 'CHANNEL_MESSAGE';

const typeDefs = gql`
  type MessageEvent {
    content: String!
    sender: String!
  }
  type Query {
    health: String
  }
  type Mutation {
    sendMessage(content: String!, sender: String!): String
  }
  type Subscription {
    messageEvent: MessageEvent
  }
`;

const resolvers = {
  Query: {
    health: () => 'OK',
  },
  Mutation: {
    sendMessage: async (_, { content, sender }) => {
      await pubsub.publish(NOTIFICATION_CHANNEL_MESSAGE, {
        messageEvent: { content, sender },
      });
      return `Received: "${content}" from "${sender}".`;
    },
  },
  Subscription: {
    messageEvent: {
      subscribe: async () => {
        return pubsub.asyncIterator([NOTIFICATION_CHANNEL_MESSAGE]);
      },
    },
  },
};

const schema = makeExecutableSchema({ typeDefs, resolvers });

const yoga = createYoga({
  schema,
});

app.use('/graphql', yoga);

const PORT = process.env.PORT;
httpServer.listen(PORT, () => {
  console.log(`Server running on port: ${PORT}`);
});
