import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { makeExecutableSchema } from '@graphql-tools/schema';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import express from 'express';
import { PubSub } from 'graphql-subscriptions';
import { gql } from 'graphql-tag';
import { useServer } from 'graphql-ws/lib/use/ws';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';

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

const wsServer = new WebSocketServer({
  server: httpServer,
  path: '/graphql',
});

const serverCleanup = useServer({ schema }, wsServer);

const server = new ApolloServer({
  schema,
  introspection: true,
  plugins: [
    ApolloServerPluginDrainHttpServer({ httpServer }),
    {
      async serverWillStart() {
        return {
          async drainServer() {
            await serverCleanup.dispose();
          },
        };
      },
    },
  ],
});

await server.start();

app.use(
  '/graphql',
  bodyParser.json(),
  expressMiddleware(server)
);

const PORT = process.env.PORT;
httpServer.listen(PORT, () => {
  console.log(`Server running on port: ${PORT}`);
});
