/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('documents', function(table) {
    table.increments('id').primary();
    table.text('title').notNullable();
    table.text('content');
    table.string('type', 50);
    table.integer('size');
    table.text('file_path');
    table.jsonb('metadata');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    table.string('model_used', 100);
    table.integer('tokens_used').defaultTo(0);
    table.decimal('cost_usd', 10, 6).defaultTo(0.000000);
    table.timestamp('verified_at');
    table.boolean('auto_verified').defaultTo(false);
    table.jsonb('parsed_data');
    table.specificType('column_headers', 'text[]');
    table.integer('row_count');
    table.string('transform_status', 50).defaultTo('pending');
    table.integer('transform_progress').defaultTo(0);
    table.string('target_table_name', 255);
    table.string('source_db_id', 100);
    table.jsonb('transform_errors');
    table.timestamp('transformed_at');
    table.double('data_quality_score');
    table.string('file_type', 50);
    table.integer('file_size');
    table.integer('chunk_count').defaultTo(0);
    table.integer('embedding_count').defaultTo(0);
    table.string('filename', 255);
    table.text('original_filename');
    table.integer('last_transform_row_count');
    table.integer('column_count');
    table.integer('upload_count').defaultTo(1);

    // Indexes
    table.unique('filename');
    table.index('file_type', 'idx_documents_file_type');
    table.index(['original_filename', 'target_table_name'], 'idx_documents_filename_table');
    table.index('original_filename', 'idx_documents_original_filename');
    table.index('source_db_id', 'idx_documents_source_db_id');
    table.index('transform_status', 'idx_documents_transform_status');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTable('documents');
};
