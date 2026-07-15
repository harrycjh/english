import TableStore from 'tablestore';

const rawClient = new TableStore.Client({
  accessKeyId: process.env.ALIBABA_CLOUD_ACCESS_KEY_ID ?? process.env.TABLESTORE_ACCESS_KEY_ID,
  secretAccessKey: process.env.ALIBABA_CLOUD_ACCESS_KEY_SECRET ?? process.env.TABLESTORE_ACCESS_KEY_SECRET,
  endpoint: process.env.TABLESTORE_ENDPOINT,
  instancename: process.env.TABLESTORE_INSTANCE_NAME,
});

const schemas = [
  {
    tableName: process.env.TABLESTORE_EVENTS_TABLE ?? 'vocab_learning_events',
    primaryKey: [
      { name: 'user_id', type: 'STRING' },
      { name: 'event_time', type: 'STRING' },
      { name: 'event_id', type: 'STRING' },
    ],
  },
  {
    tableName: process.env.TABLESTORE_WORDS_TABLE ?? 'vocab_word_states',
    primaryKey: [
      { name: 'user_id', type: 'STRING' },
      { name: 'word_id', type: 'STRING' },
    ],
  },
  {
    tableName: process.env.TABLESTORE_APP_TABLE ?? 'vocab_app_states',
    primaryKey: [
      { name: 'user_id', type: 'STRING' },
      { name: 'state_type', type: 'STRING' },
      { name: 'state_id', type: 'STRING' },
    ],
  },
];

const existing = new Set((await rawClient.listTable({})).tableNames ?? []);
for (const tableMeta of schemas) {
  if (existing.has(tableMeta.tableName)) {
    console.log(`exists: ${tableMeta.tableName}`);
    continue;
  }
  await rawClient.createTable({
    tableMeta,
    tableOptions: { timeToLive: -1, maxVersions: 1, maxTimeDeviation: 86400, allowUpdate: true },
    reservedThroughput: { capacityUnit: { read: 0, write: 0 } },
  });
  console.log(`created: ${tableMeta.tableName}`);
}
