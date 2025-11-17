import type { IExecuteFunctions } from 'n8n-workflow';
import type { INodeExecutionData, INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeOperationError, NodeConnectionType } from 'n8n-workflow';
import { chunkText } from '../shared/chunk';

export class TextChunk implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Text Chunk',
    name: 'textChunk',
    group: ['transform'],
    version: 2.0,
    description: 'Split long text into overlapping chunks',
    defaults: { name: 'Text Chunk' },
    inputs: [NodeConnectionType.Main],
    outputs: [NodeConnectionType.Main],
    properties: [
      { displayName: 'Text Field (from item)', name: 'textField', type: 'string', default: 'content' },
      { displayName: 'Max Characters', name: 'maxChars', type: 'number', default: 1000 },
      { displayName: 'Overlap', name: 'overlap', type: 'number', default: 100 },
      { displayName: 'Output Field', name: 'outputField', type: 'string', default: 'chunk' },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    
    const promises = items.map(async (item: INodeExecutionData, i: number) => {
      try {
        const textField = (this.getNodeParameter('textField', i) as string) || 'content';
        const maxChars = this.getNodeParameter('maxChars', i) as number;
        const overlap = this.getNodeParameter('overlap', i) as number;
        const outputField = (this.getNodeParameter('outputField', i) as string) || 'chunk';
        const json = item.json ?? {};
        
        // Helper to safely access nested properties
        const getText = (obj: any, path: string) => path.split('.').reduce((acc, k) => acc?.[k], obj);
        const text = getText(json, textField);

        if (typeof text !== 'string') {
          // If the text is not found, we can either skip or return an error.
          // Returning the original item with an error property is more informative.
          const errorJson = { ...json, error: `Text not found at field "${textField}"` };
          return [{ json: errorJson, error: new NodeOperationError(this.getNode(), `Text not found on item ${i}`, { itemIndex: i }) }];
        }

        const chunks = chunkText(text, { maxChars, overlap });
        
        // Create a new n8n item for each chunk, preserving the original data.
        return chunks.map(chunk => {
          const newItemJson = { ...json };
          // Helper to safely set nested properties
          const setChunk = (obj: any, path: string, value: string) => {
            const keys = path.split('.');
            const lastKey = keys.pop()!;
            const target = keys.reduce((acc, k) => acc[k] = acc[k] || {}, obj);
            target[lastKey] = value;
          };
          setChunk(newItemJson, outputField, chunk);
          return { json: newItemJson };
        });
      } catch (err) {
        const error = new NodeOperationError(this.getNode(), (err as Error).message, { itemIndex: i });
        return [{ json: item.json, error }];
      }
    });

    const results = await Promise.all(promises);
    
    // Flatten the array of arrays into a single array of items.
    const allNewItems = results.flat();

    return [allNewItems];
  }
}

