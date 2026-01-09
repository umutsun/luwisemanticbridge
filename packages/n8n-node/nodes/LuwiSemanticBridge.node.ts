import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeConnectionType,
} from 'n8n-workflow';
import OpenAI from 'openai';

export class LuwiSemanticBridge implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Luwi Semantic Bridge',
    name: 'luwiSemanticBridge',
    icon: 'file:LuwiSemanticBridge.svg',
    group: ['transform'],
    version: 2,
    subtitle: '={{$parameter["operation"]}}',
    description: 'Connect to Luwi Chat API, format responses for bots, and generate media',
    defaults: {
      name: 'Luwi Semantic Bridge',
    },
    inputs: [NodeConnectionType.Main],
    outputs: [NodeConnectionType.Main],
    credentials: [
      {
        name: 'luwiSemanticBridgeApi',
        required: true,
      },
    ],
    properties: [
      // ===================
      // OPERATION SELECTOR
      // ===================
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: 'Chat with Luwi',
            value: 'chat',
            description: 'Send a message to Luwi Chat API and get RAG response',
            action: 'Send message to Luwi',
          },
          {
            name: 'Get Conversation',
            value: 'getConversation',
            description: 'Get conversation history',
            action: 'Get conversation history',
          },
          {
            name: 'Format for Telegram',
            value: 'formatTelegram',
            description: 'Format response for Telegram bot',
            action: 'Format for Telegram',
          },
          {
            name: 'Format for WhatsApp',
            value: 'formatWhatsApp',
            description: 'Format response for WhatsApp bot',
            action: 'Format for WhatsApp',
          },
          {
            name: 'Format for Discord',
            value: 'formatDiscord',
            description: 'Format response for Discord bot',
            action: 'Format for Discord',
          },
          {
            name: 'Format for Slack',
            value: 'formatSlack',
            description: 'Format response for Slack bot',
            action: 'Format for Slack',
          },
          {
            name: 'Generate Image',
            value: 'generateImage',
            description: 'Generate image from text using DALL-E',
            action: 'Generate image with DALL-E',
          },
          {
            name: 'Generate Audio',
            value: 'generateAudio',
            description: 'Generate audio from text using OpenAI TTS',
            action: 'Generate audio with TTS',
          },
        ],
        default: 'chat',
      },

      // ===================
      // CHAT WITH LUWI OPTIONS
      // ===================
      {
        displayName: 'Message',
        name: 'chatMessage',
        type: 'string',
        typeOptions: {
          rows: 3,
        },
        default: '',
        placeholder: 'Vergi beyannamesi ne zaman verilir?',
        description: 'The message to send to Luwi Chat API',
        displayOptions: {
          show: {
            operation: ['chat'],
          },
        },
        required: true,
      },
      {
        displayName: 'Conversation ID',
        name: 'conversationId',
        type: 'string',
        default: '',
        placeholder: 'Leave empty to start new conversation',
        description: 'Existing conversation ID to continue, or empty for new',
        displayOptions: {
          show: {
            operation: ['chat', 'getConversation'],
          },
        },
      },
      {
        displayName: 'Model',
        name: 'chatModel',
        type: 'options',
        options: [
          { name: 'GPT-4o Mini (Fast)', value: 'gpt-4o-mini' },
          { name: 'GPT-4o (Recommended)', value: 'gpt-4o' },
          { name: 'GPT-4 Turbo', value: 'gpt-4-turbo' },
        ],
        default: 'gpt-4o-mini',
        description: 'AI model to use for chat completion',
        displayOptions: {
          show: {
            operation: ['chat'],
          },
        },
      },
      {
        displayName: 'Temperature',
        name: 'chatTemperature',
        type: 'number',
        default: 0.7,
        typeOptions: {
          minValue: 0,
          maxValue: 2,
          numberPrecision: 1,
        },
        description: 'Controls randomness (0=focused, 1=creative)',
        displayOptions: {
          show: {
            operation: ['chat'],
          },
        },
      },
      {
        displayName: 'Language',
        name: 'chatLanguage',
        type: 'options',
        options: [
          { name: 'Turkish', value: 'tr' },
          { name: 'English', value: 'en' },
          { name: 'Auto Detect', value: 'auto' },
        ],
        default: 'tr',
        description: 'Response language',
        displayOptions: {
          show: {
            operation: ['chat'],
          },
        },
      },

      // ===================
      // FORMAT OPTIONS (SHARED)
      // ===================
      {
        displayName: 'Message',
        name: 'formatMessage',
        type: 'string',
        typeOptions: {
          rows: 4,
        },
        default: '',
        placeholder: 'Message to format...',
        description: 'The message content to format for the platform',
        displayOptions: {
          show: {
            operation: ['formatTelegram', 'formatWhatsApp', 'formatDiscord', 'formatSlack'],
          },
        },
      },
      {
        displayName: 'Include Sources',
        name: 'includeSources',
        type: 'boolean',
        default: true,
        description: 'Whether to include source references',
        displayOptions: {
          show: {
            operation: ['formatTelegram', 'formatWhatsApp', 'formatDiscord', 'formatSlack'],
          },
        },
      },
      {
        displayName: 'Sources',
        name: 'sources',
        type: 'json',
        default: '[]',
        description: 'Array of sources [{title, url, similarity}]',
        displayOptions: {
          show: {
            operation: ['formatTelegram', 'formatWhatsApp', 'formatDiscord', 'formatSlack'],
            includeSources: [true],
          },
        },
      },

      // TELEGRAM SPECIFIC
      {
        displayName: 'Parse Mode',
        name: 'telegramParseMode',
        type: 'options',
        options: [
          { name: 'HTML', value: 'HTML' },
          { name: 'Markdown', value: 'Markdown' },
          { name: 'MarkdownV2', value: 'MarkdownV2' },
        ],
        default: 'HTML',
        displayOptions: {
          show: {
            operation: ['formatTelegram'],
          },
        },
      },

      // DISCORD SPECIFIC
      {
        displayName: 'Use Embed',
        name: 'discordUseEmbed',
        type: 'boolean',
        default: true,
        description: 'Whether to use Discord embed format',
        displayOptions: {
          show: {
            operation: ['formatDiscord'],
          },
        },
      },
      {
        displayName: 'Embed Color',
        name: 'discordEmbedColor',
        type: 'color',
        default: '#6366f1',
        displayOptions: {
          show: {
            operation: ['formatDiscord'],
            discordUseEmbed: [true],
          },
        },
      },

      // ===================
      // IMAGE GENERATION
      // ===================
      {
        displayName: 'Prompt',
        name: 'imagePrompt',
        type: 'string',
        typeOptions: {
          rows: 3,
        },
        default: '',
        placeholder: 'A professional infographic about tax regulations...',
        description: 'Text description for image generation',
        displayOptions: {
          show: {
            operation: ['generateImage'],
          },
        },
        required: true,
      },
      {
        displayName: 'Model',
        name: 'imageModel',
        type: 'options',
        options: [
          { name: 'DALL-E 3', value: 'dall-e-3' },
          { name: 'DALL-E 2', value: 'dall-e-2' },
        ],
        default: 'dall-e-3',
        displayOptions: {
          show: {
            operation: ['generateImage'],
          },
        },
      },
      {
        displayName: 'Size',
        name: 'imageSize',
        type: 'options',
        options: [
          { name: '1024x1024 (Square)', value: '1024x1024' },
          { name: '1792x1024 (Landscape)', value: '1792x1024' },
          { name: '1024x1792 (Portrait)', value: '1024x1792' },
        ],
        default: '1024x1024',
        displayOptions: {
          show: {
            operation: ['generateImage'],
          },
        },
      },
      {
        displayName: 'Quality',
        name: 'imageQuality',
        type: 'options',
        options: [
          { name: 'Standard', value: 'standard' },
          { name: 'HD', value: 'hd' },
        ],
        default: 'standard',
        displayOptions: {
          show: {
            operation: ['generateImage'],
            imageModel: ['dall-e-3'],
          },
        },
      },

      // ===================
      // AUDIO GENERATION
      // ===================
      {
        displayName: 'Text',
        name: 'audioText',
        type: 'string',
        typeOptions: {
          rows: 4,
        },
        default: '',
        placeholder: 'Text to convert to speech...',
        description: 'Text content for audio generation',
        displayOptions: {
          show: {
            operation: ['generateAudio'],
          },
        },
        required: true,
      },
      {
        displayName: 'Voice',
        name: 'audioVoice',
        type: 'options',
        options: [
          { name: 'Alloy', value: 'alloy' },
          { name: 'Echo', value: 'echo' },
          { name: 'Fable', value: 'fable' },
          { name: 'Onyx', value: 'onyx' },
          { name: 'Nova', value: 'nova' },
          { name: 'Shimmer', value: 'shimmer' },
        ],
        default: 'alloy',
        displayOptions: {
          show: {
            operation: ['generateAudio'],
          },
        },
      },
      {
        displayName: 'Model',
        name: 'audioModel',
        type: 'options',
        options: [
          { name: 'TTS-1 (Fast)', value: 'tts-1' },
          { name: 'TTS-1 HD (Quality)', value: 'tts-1-hd' },
        ],
        default: 'tts-1',
        displayOptions: {
          show: {
            operation: ['generateAudio'],
          },
        },
      },
      {
        displayName: 'Speed',
        name: 'audioSpeed',
        type: 'number',
        default: 1.0,
        typeOptions: {
          minValue: 0.25,
          maxValue: 4.0,
          numberPrecision: 2,
        },
        description: 'Speed of speech (0.25 to 4.0)',
        displayOptions: {
          show: {
            operation: ['generateAudio'],
          },
        },
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    const operation = this.getNodeParameter('operation', 0) as string;
    const credentials = await this.getCredentials('luwiSemanticBridgeApi');

    for (let i = 0; i < items.length; i++) {
      try {
        // ===================
        // CHAT WITH LUWI
        // ===================
        if (operation === 'chat') {
          const message = this.getNodeParameter('chatMessage', i) as string;
          const conversationId = this.getNodeParameter('conversationId', i, '') as string;
          const model = this.getNodeParameter('chatModel', i) as string;
          const temperature = this.getNodeParameter('chatTemperature', i) as number;
          const language = this.getNodeParameter('chatLanguage', i) as string;

          const apiUrl = credentials.luwiApiUrl as string;
          const apiToken = credentials.luwiApiToken as string;

          const response = await fetch(`${apiUrl}/api/v2/chat`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${apiToken}`,
            },
            body: JSON.stringify({
              message,
              conversationId: conversationId || undefined,
              model,
              temperature,
              language,
            }),
          });

          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Luwi API error: ${response.status} - ${errorText}`);
          }

          const result = await response.json();

          returnData.push({
            json: {
              success: true,
              answer: result.response || result.answer,
              conversationId: result.conversationId,
              sources: result.sources || [],
              model,
              usage: result.usage,
            },
          });
        }

        // ===================
        // GET CONVERSATION
        // ===================
        else if (operation === 'getConversation') {
          const conversationId = this.getNodeParameter('conversationId', i) as string;
          const apiUrl = credentials.luwiApiUrl as string;
          const apiToken = credentials.luwiApiToken as string;

          const response = await fetch(`${apiUrl}/api/v2/chat/conversation/${conversationId}`, {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${apiToken}`,
            },
          });

          if (!response.ok) {
            throw new Error(`Failed to get conversation: ${response.status}`);
          }

          const result = await response.json();
          returnData.push({ json: result });
        }

        // ===================
        // FORMAT FOR TELEGRAM
        // ===================
        else if (operation === 'formatTelegram') {
          const message = this.getNodeParameter('formatMessage', i) as string;
          const parseMode = this.getNodeParameter('telegramParseMode', i) as string;
          const includeSources = this.getNodeParameter('includeSources', i) as boolean;

          let formattedMessage = message;

          if (includeSources) {
            const sources = this.getNodeParameter('sources', i, []) as Array<{title: string, url: string}>;
            if (sources.length > 0) {
              if (parseMode === 'HTML') {
                formattedMessage += '\n\n<b>📚 Kaynaklar:</b>\n';
                sources.slice(0, 5).forEach((s, idx) => {
                  formattedMessage += `${idx + 1}. <a href="${s.url}">${s.title}</a>\n`;
                });
              } else {
                formattedMessage += '\n\n*📚 Kaynaklar:*\n';
                sources.slice(0, 5).forEach((s, idx) => {
                  formattedMessage += `${idx + 1}. [${s.title}](${s.url})\n`;
                });
              }
            }
          }

          returnData.push({
            json: {
              text: formattedMessage,
              parse_mode: parseMode,
              platform: 'telegram',
            },
          });
        }

        // ===================
        // FORMAT FOR WHATSAPP
        // ===================
        else if (operation === 'formatWhatsApp') {
          const message = this.getNodeParameter('formatMessage', i) as string;
          const includeSources = this.getNodeParameter('includeSources', i) as boolean;

          let formattedMessage = message
            .replace(/\*\*(.*?)\*\*/g, '*$1*')  // Bold
            .replace(/__(.*?)__/g, '_$1_');     // Italic

          if (includeSources) {
            const sources = this.getNodeParameter('sources', i, []) as Array<{title: string, url: string}>;
            if (sources.length > 0) {
              formattedMessage += '\n\n📚 *Kaynaklar:*\n';
              sources.slice(0, 5).forEach((s, idx) => {
                formattedMessage += `${idx + 1}. ${s.title}\n${s.url}\n`;
              });
            }
          }

          returnData.push({
            json: {
              text: formattedMessage,
              platform: 'whatsapp',
            },
          });
        }

        // ===================
        // FORMAT FOR DISCORD
        // ===================
        else if (operation === 'formatDiscord') {
          const message = this.getNodeParameter('formatMessage', i) as string;
          const useEmbed = this.getNodeParameter('discordUseEmbed', i) as boolean;
          const includeSources = this.getNodeParameter('includeSources', i) as boolean;

          if (useEmbed) {
            const embedColor = this.getNodeParameter('discordEmbedColor', i) as string;
            const colorInt = parseInt(embedColor.replace('#', ''), 16);

            const embed: any = {
              description: message.substring(0, 4096),
              color: colorInt,
              footer: {
                text: 'Powered by Luwi Semantic Bridge',
              },
              timestamp: new Date().toISOString(),
            };

            if (includeSources) {
              const sources = this.getNodeParameter('sources', i, []) as Array<{title: string, url: string}>;
              if (sources.length > 0) {
                embed.fields = sources.slice(0, 5).map((s, idx) => ({
                  name: `📄 Kaynak ${idx + 1}`,
                  value: `[${s.title}](${s.url})`,
                  inline: true,
                }));
              }
            }

            returnData.push({
              json: {
                embeds: [embed],
                platform: 'discord',
              },
            });
          } else {
            let formattedMessage = message;
            if (includeSources) {
              const sources = this.getNodeParameter('sources', i, []) as Array<{title: string, url: string}>;
              if (sources.length > 0) {
                formattedMessage += '\n\n**📚 Kaynaklar:**\n';
                sources.slice(0, 5).forEach((s, idx) => {
                  formattedMessage += `${idx + 1}. [${s.title}](${s.url})\n`;
                });
              }
            }
            returnData.push({
              json: {
                content: formattedMessage,
                platform: 'discord',
              },
            });
          }
        }

        // ===================
        // FORMAT FOR SLACK
        // ===================
        else if (operation === 'formatSlack') {
          const message = this.getNodeParameter('formatMessage', i) as string;
          const includeSources = this.getNodeParameter('includeSources', i) as boolean;

          const blocks: any[] = [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: message,
              },
            },
          ];

          if (includeSources) {
            const sources = this.getNodeParameter('sources', i, []) as Array<{title: string, url: string}>;
            if (sources.length > 0) {
              blocks.push({ type: 'divider' });
              blocks.push({
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: '*📚 Kaynaklar:*\n' + sources.slice(0, 5).map((s, idx) =>
                    `${idx + 1}. <${s.url}|${s.title}>`
                  ).join('\n'),
                },
              });
            }
          }

          blocks.push({
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: '_Powered by Luwi Semantic Bridge_',
              },
            ],
          });

          returnData.push({
            json: {
              blocks,
              text: message, // Fallback
              platform: 'slack',
            },
          });
        }

        // ===================
        // GENERATE IMAGE
        // ===================
        else if (operation === 'generateImage') {
          const prompt = this.getNodeParameter('imagePrompt', i) as string;
          const model = this.getNodeParameter('imageModel', i) as string;
          const size = this.getNodeParameter('imageSize', i) as string;
          const quality = model === 'dall-e-3'
            ? this.getNodeParameter('imageQuality', i) as string
            : 'standard';

          const openaiKey = credentials.openaiApiKey as string;
          if (!openaiKey) {
            throw new Error('OpenAI API key is required for image generation');
          }

          const openai = new OpenAI({ apiKey: openaiKey });

          const response = await openai.images.generate({
            model,
            prompt,
            size: size as any,
            quality: quality as any,
            n: 1,
          });

          returnData.push({
            json: {
              success: true,
              url: response.data[0].url,
              revised_prompt: response.data[0].revised_prompt,
              model,
              size,
            },
          });
        }

        // ===================
        // GENERATE AUDIO
        // ===================
        else if (operation === 'generateAudio') {
          const text = this.getNodeParameter('audioText', i) as string;
          const voice = this.getNodeParameter('audioVoice', i) as string;
          const model = this.getNodeParameter('audioModel', i) as string;
          const speed = this.getNodeParameter('audioSpeed', i) as number;

          const openaiKey = credentials.openaiApiKey as string;
          if (!openaiKey) {
            throw new Error('OpenAI API key is required for audio generation');
          }

          const openai = new OpenAI({ apiKey: openaiKey });

          const response = await openai.audio.speech.create({
            model,
            voice: voice as any,
            input: text,
            speed,
          });

          // Convert to base64
          const buffer = Buffer.from(await response.arrayBuffer());
          const base64Audio = buffer.toString('base64');

          returnData.push({
            json: {
              success: true,
              audio: base64Audio,
              format: 'mp3',
              voice,
              model,
            },
            binary: {
              audio: {
                data: base64Audio,
                mimeType: 'audio/mpeg',
                fileName: 'speech.mp3',
              },
            },
          });
        }

      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: {
              error: error instanceof Error ? error.message : String(error),
            },
          });
          continue;
        }
        throw error;
      }
    }

    return [returnData];
  }
}
