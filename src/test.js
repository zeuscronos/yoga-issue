import pkg from '@apollo/client';
import fetch from 'cross-fetch';
import dotenv from 'dotenv';
import gql from 'graphql-tag';
import { createClient } from 'graphql-ws';
import ws from 'ws';

const { ApolloClient, ApolloLink, HttpLink, InMemoryCache, Observable } = pkg;

const expect = (value) => {
  return {
    toBe: (expected) => {
      if (value !== expected) {
        throw new Error(`Received: ${value} | Expected: ${expected}`);
      }
    },
  };
};

const createPromiseSignal = () => {
  let resolveFunction;
  const promise = new Promise((resolve) => {
    resolveFunction = resolve;
  });

  return [resolveFunction, promise];
};

// prettier-ignore
class GraphQLWsLink extends ApolloLink {
  constructor(url) {
    super();
    this.client = createClient({ url, webSocketImpl: ws });
  }
  request(operation) {
    return new Observable((observer) => {
      const { query, variables } = operation;
      const dispose = this.client.subscribe(
        {
          query: query.loc?.source.body || '',
          variables,
        },
        {
          next: (data) => observer.next(data),
          error: (err) => observer.error(err.reason ? new Error(err.reason) : err),
          complete: () => observer.complete(),
        }
      );

      return () => {
        dispose();
      };
    });
  }
  onConnected(callback) {
    this.client.on('connected', callback);
  }
  async close() {
    await this.client.dispose();
  }
}

dotenv.config();

const httpUri = `http://localhost:${process.env.PORT}/graphql`;

let client1 = null;
let client2 = null;
let subscription = null;
let subscriptionSuccess = false;

const messageContent = 'Hello World!';
const messageSender = 'Bill Gates';

try {
  const wsLink = new GraphQLWsLink(httpUri.replace(/^http:\/\//, 'ws://'));

  client1 = new ApolloClient({
    link: wsLink,
    cache: new InMemoryCache(),
  });

  // prettier-ignore
  const [wsLinkConnectionResolve, wsLinkConnectionPromise] = createPromiseSignal();

  wsLink.onConnected(wsLinkConnectionResolve);

  const observer = client1.subscribe({
    query: gql`
      subscription messageSubscription {
        messageEvent {
          content
          sender
        }
      }
    `,
  });

  // prettier-ignore
  const [subscriptionResolve, subscriptionPromise] = createPromiseSignal();

  subscription = observer.subscribe({
    next(response) {
      expect(response.data.messageEvent.content).toBe(messageContent);
      expect(response.data.messageEvent.sender).toBe(messageSender);
      subscriptionSuccess = true;
      subscriptionResolve();
    },
  });

  await wsLinkConnectionPromise;

  client2 = new ApolloClient({
    link: new HttpLink({
      uri: httpUri,
      fetch,
    }),
    cache: new InMemoryCache(),
  });

  // prettier-ignore
  const { data: { sendMessage } } = await client2.mutate({
    mutation: gql`
      mutation sendMessage($content: String!, $sender: String!) {
        sendMessage(content: $content, sender: $sender)
      }
    `,
    variables: {
      content: messageContent,
      sender: messageSender,
    },
  });

  // prettier-ignore
  expect(sendMessage).toBe(`Received: "${messageContent}" from "${messageSender}".`, 'sendMessage mutation failed.');
  await subscriptionPromise;
  expect(subscriptionSuccess).toBe(true, 'Subscription failed.');

  console.log('All tests passed!');
} finally {
  if (subscription) {
    subscription.unsubscribe();
  }
  if (client1) {
    client1.stop();
    client1 = null;
  }
  if (client2) {
    client2.stop();
    client2 = null;
  }
}
