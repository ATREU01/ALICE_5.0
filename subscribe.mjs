import { createClient } from 'graphql-ws';
import WebSocket from 'ws';

const token = 'ory_at_neReIg_82BmLrhJCKDbQN42H-x9kbmSGvhSIqdgZOuI.lI4osqsMdinCGSHOLUlG4TNgPFPtpYAUS4b_qpnNod4';

const client = createClient({
  url: 'wss://streaming.bitquery.io/graphql',
  connectionParams: {
    headers: {
      Authorization: `Bearer ${token}`,
    }
  },
  webSocketImpl: WebSocket,
});

(async () => {
  console.log('📡 Connecting to Bitquery WebSocket...');

  await new Promise((resolve, reject) => {
    client.subscribe(
      {
        query: `
          subscription {
            Solana {
              Instructions(
                where: {
                  Instruction: {
                    Program: {
                      Address: { is: "LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj" },
                      Method: { in: ["migrate_to_amm", "migrate_to_cpswap"] }
                    }
                  },
                  Transaction: { Result: { Success: true } }
                }
              ) {
                Block { Time }
                Instruction {
                  Program { Method }
                  Accounts {
                    Token { Mint }
                  }
                }
                Transaction { Signature }
              }
            }
          }
        `
      },
      {
        next: (data) => console.log('📥 Data:', JSON.stringify(data, null, 2)),
        error: (err) => {
          console.error('❌ Subscription error:', err);
          reject(err);
        },
        complete: () => {
          console.log('✅ Subscription complete');
          resolve();
        }
      }
    );
  });
})();
