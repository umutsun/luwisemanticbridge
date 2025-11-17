import { ICredentialType, INodeProperties } from 'n8n-workflow';

export class PostgresWithVectorApi implements ICredentialType {
  name = 'postgresWithVectorApi';
  displayName = 'Postgres (pgvector)';
  properties: INodeProperties[] = [
    {
      displayName: 'Host',
      name: 'host',
      type: 'string',
      default: 'localhost',
      placeholder: 'localhost',
      required: true,
    },
    {
      displayName: 'Port',
      name: 'port',
      type: 'number',
      default: 5432,
      required: true,
    },
    {
      displayName: 'Database',
      name: 'database',
      type: 'string',
      default: '',
      required: true,
    },
    {
      displayName: 'User',
      name: 'user',
      type: 'string',
      default: '',
      required: true,
    },
    {
      displayName: 'Password',
      name: 'password',
      type: 'string',
      typeOptions: { password: true },
      default: '',
    },
    {
      displayName: 'SSL',
      name: 'ssl',
      type: 'boolean',
      default: false,
      description: 'Enable SSL/TLS when connecting to Postgres',
    }
  ];
}

