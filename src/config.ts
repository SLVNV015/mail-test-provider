export const appConfig = {
  provider: {
    port: 8080,
    host: "http://provider",
  },
  postgres: {
    host: "postgres-threads",
    port: 5432,
    user: "postgres",
    password: "postgres",
    database: "postgres",
    getDBString: () => {
      return `postgres://${appConfig.postgres.user}:${appConfig.postgres.password}@${appConfig.postgres.host}:${appConfig.postgres.port}/${appConfig.postgres.database}`;
    },
  },
  logger: {
    level: "debug",
  },
};
