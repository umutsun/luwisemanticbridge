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
          // SOCIAL MEDIA
          {
            name: 'Format for Twitter/X',
            value: 'formatTwitter',
            description: 'Format response for Twitter/X with thread support',
            action: 'Format for Twitter/X',
          },
          {
            name: 'Format for LinkedIn',
            value: 'formatLinkedIn',
            description: 'Format response for LinkedIn post',
            action: 'Format for LinkedIn',
          },
          {
            name: 'Format for Instagram',
            value: 'formatInstagram',
            description: 'Format response for Instagram caption',
            action: 'Format for Instagram',
          },
          {
            name: 'Generate Hashtags',
            value: 'generateHashtags',
            description: 'Generate relevant hashtags using AI',
            action: 'Generate hashtags with AI',
          },
          {
            name: 'Generate Caption',
            value: 'generateCaption',
            description: 'Generate social media caption using AI',
            action: 'Generate caption with AI',
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
            operation: ['formatTelegram', 'formatWhatsApp', 'formatDiscord', 'formatSlack', 'formatTwitter', 'formatLinkedIn', 'formatInstagram'],
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

      // TWITTER/X SPECIFIC
      {
        displayName: 'Create Thread',
        name: 'twitterCreateThread',
        type: 'boolean',
        default: true,
        description: 'Whether to split long messages into Twitter thread',
        displayOptions: {
          show: {
            operation: ['formatTwitter'],
          },
        },
      },
      {
        displayName: 'Include Hashtags',
        name: 'twitterIncludeHashtags',
        type: 'boolean',
        default: true,
        description: 'Whether to add relevant hashtags',
        displayOptions: {
          show: {
            operation: ['formatTwitter'],
          },
        },
      },
      {
        displayName: 'Hashtags',
        name: 'twitterHashtags',
        type: 'string',
        default: '',
        placeholder: '#AI #Technology #News',
        description: 'Custom hashtags to add (space or comma separated)',
        displayOptions: {
          show: {
            operation: ['formatTwitter'],
            twitterIncludeHashtags: [true],
          },
        },
      },

      // LINKEDIN SPECIFIC
      {
        displayName: 'Post Type',
        name: 'linkedinPostType',
        type: 'options',
        options: [
          { name: 'Standard Post', value: 'post' },
          { name: 'Article', value: 'article' },
          { name: 'Document/Carousel', value: 'document' },
        ],
        default: 'post',
        displayOptions: {
          show: {
            operation: ['formatLinkedIn'],
          },
        },
      },
      {
        displayName: 'Add Call to Action',
        name: 'linkedinCTA',
        type: 'boolean',
        default: true,
        description: 'Whether to add engagement prompt at the end',
        displayOptions: {
          show: {
            operation: ['formatLinkedIn'],
          },
        },
      },

      // INSTAGRAM SPECIFIC
      {
        displayName: 'Caption Style',
        name: 'instagramStyle',
        type: 'options',
        options: [
          { name: 'Professional', value: 'professional' },
          { name: 'Casual', value: 'casual' },
          { name: 'Storytelling', value: 'storytelling' },
          { name: 'Educational', value: 'educational' },
        ],
        default: 'professional',
        displayOptions: {
          show: {
            operation: ['formatInstagram'],
          },
        },
      },
      {
        displayName: 'Add Emojis',
        name: 'instagramEmojis',
        type: 'boolean',
        default: true,
        description: 'Whether to add relevant emojis',
        displayOptions: {
          show: {
            operation: ['formatInstagram'],
          },
        },
      },
      {
        displayName: 'Max Hashtags',
        name: 'instagramMaxHashtags',
        type: 'number',
        default: 10,
        typeOptions: {
          minValue: 0,
          maxValue: 30,
        },
        description: 'Maximum number of hashtags (Instagram allows up to 30)',
        displayOptions: {
          show: {
            operation: ['formatInstagram'],
          },
        },
      },

      // ===================
      // AI CONTENT GENERATION
      // ===================
      {
        displayName: 'Content',
        name: 'aiContent',
        type: 'string',
        typeOptions: {
          rows: 4,
        },
        default: '',
        placeholder: 'Content to generate hashtags/caption for...',
        description: 'The content to analyze for generating hashtags or caption',
        displayOptions: {
          show: {
            operation: ['generateHashtags', 'generateCaption'],
          },
        },
        required: true,
      },
      {
        displayName: 'Platform',
        name: 'aiPlatform',
        type: 'options',
        options: [
          { name: 'Twitter/X', value: 'twitter' },
          { name: 'LinkedIn', value: 'linkedin' },
          { name: 'Instagram', value: 'instagram' },
          { name: 'Facebook', value: 'facebook' },
          { name: 'General', value: 'general' },
        ],
        default: 'general',
        description: 'Target platform for optimization',
        displayOptions: {
          show: {
            operation: ['generateHashtags', 'generateCaption'],
          },
        },
      },
      {
        displayName: 'Language',
        name: 'aiLanguage',
        type: 'options',
        options: [
          { name: 'Turkish', value: 'tr' },
          { name: 'English', value: 'en' },
          { name: 'Auto (Same as Content)', value: 'auto' },
        ],
        default: 'auto',
        displayOptions: {
          show: {
            operation: ['generateHashtags', 'generateCaption'],
          },
        },
      },
      {
        displayName: 'Number of Hashtags',
        name: 'hashtagCount',
        type: 'number',
        default: 10,
        typeOptions: {
          minValue: 1,
          maxValue: 30,
        },
        displayOptions: {
          show: {
            operation: ['generateHashtags'],
          },
        },
      },
      {
        displayName: 'Caption Style',
        name: 'captionStyle',
        type: 'options',
        options: [
          { name: 'Professional', value: 'professional' },
          { name: 'Casual & Friendly', value: 'casual' },
          { name: 'Witty & Humorous', value: 'witty' },
          { name: 'Inspirational', value: 'inspirational' },
          { name: 'Educational', value: 'educational' },
        ],
        default: 'professional',
        displayOptions: {
          show: {
            operation: ['generateCaption'],
          },
        },
      },
      {
        displayName: 'Include Hashtags in Caption',
        name: 'captionIncludeHashtags',
        type: 'boolean',
        default: true,
        displayOptions: {
          show: {
            operation: ['generateCaption'],
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

        // ===================
        // FORMAT FOR TWITTER/X
        // ===================
        else if (operation === 'formatTwitter') {
          const message = this.getNodeParameter('formatMessage', i) as string;
          const createThread = this.getNodeParameter('twitterCreateThread', i) as boolean;
          const includeHashtags = this.getNodeParameter('twitterIncludeHashtags', i) as boolean;

          const TWEET_LIMIT = 280;
          let hashtags = '';

          if (includeHashtags) {
            hashtags = this.getNodeParameter('twitterHashtags', i, '') as string;
          }

          // Split into thread if needed
          const tweets: string[] = [];
          if (createThread && message.length > TWEET_LIMIT) {
            // Split by sentences or at word boundaries
            const sentences = message.split(/(?<=[.!?])\s+/);
            let currentTweet = '';

            for (const sentence of sentences) {
              if ((currentTweet + ' ' + sentence).trim().length <= TWEET_LIMIT - 10) {
                currentTweet = (currentTweet + ' ' + sentence).trim();
              } else {
                if (currentTweet) {
                  tweets.push(currentTweet);
                }
                // Handle long sentences
                if (sentence.length > TWEET_LIMIT - 10) {
                  const words = sentence.split(' ');
                  currentTweet = '';
                  for (const word of words) {
                    if ((currentTweet + ' ' + word).trim().length <= TWEET_LIMIT - 10) {
                      currentTweet = (currentTweet + ' ' + word).trim();
                    } else {
                      if (currentTweet) tweets.push(currentTweet);
                      currentTweet = word;
                    }
                  }
                } else {
                  currentTweet = sentence;
                }
              }
            }
            if (currentTweet) tweets.push(currentTweet);

            // Add thread numbering
            const numberedTweets = tweets.map((tweet, idx) =>
              `${idx + 1}/${tweets.length} ${tweet}`
            );

            // Add hashtags to last tweet
            if (hashtags && numberedTweets.length > 0) {
              const lastIdx = numberedTweets.length - 1;
              if ((numberedTweets[lastIdx] + '\n\n' + hashtags).length <= TWEET_LIMIT) {
                numberedTweets[lastIdx] += '\n\n' + hashtags;
              }
            }

            returnData.push({
              json: {
                isThread: true,
                tweetCount: numberedTweets.length,
                tweets: numberedTweets,
                platform: 'twitter',
              },
            });
          } else {
            // Single tweet
            let tweet = message.substring(0, TWEET_LIMIT);
            if (hashtags && (tweet + '\n\n' + hashtags).length <= TWEET_LIMIT) {
              tweet += '\n\n' + hashtags;
            }

            returnData.push({
              json: {
                isThread: false,
                tweetCount: 1,
                tweets: [tweet],
                text: tweet,
                platform: 'twitter',
              },
            });
          }
        }

        // ===================
        // FORMAT FOR LINKEDIN
        // ===================
        else if (operation === 'formatLinkedIn') {
          const message = this.getNodeParameter('formatMessage', i) as string;
          const postType = this.getNodeParameter('linkedinPostType', i) as string;
          const addCTA = this.getNodeParameter('linkedinCTA', i) as boolean;

          let formattedPost = message;

          // LinkedIn formatting
          formattedPost = formattedPost
            .replace(/\*\*(.*?)\*\*/g, '$1') // Remove markdown bold (LinkedIn doesn't support)
            .replace(/\*(.*?)\*/g, '$1');    // Remove markdown italic

          // Add line breaks for readability
          if (postType === 'post') {
            // Standard post - max 3000 chars
            formattedPost = formattedPost.substring(0, 3000);
          } else if (postType === 'article') {
            // Article summary
            formattedPost = formattedPost.substring(0, 700);
          }

          // Add CTA
          if (addCTA) {
            const ctas = [
              '\n\n💬 Ne düşünüyorsunuz? Yorumlarınızı bekliyorum.',
              '\n\n👇 Sizin deneyimleriniz neler? Paylaşın!',
              '\n\n🔔 Daha fazla içerik için takip edin.',
              '\n\n💡 Bu konuda sorularınız varsa yorumlarda cevaplayalım.',
            ];
            formattedPost += ctas[Math.floor(Math.random() * ctas.length)];
          }

          returnData.push({
            json: {
              text: formattedPost,
              postType,
              characterCount: formattedPost.length,
              platform: 'linkedin',
            },
          });
        }

        // ===================
        // FORMAT FOR INSTAGRAM
        // ===================
        else if (operation === 'formatInstagram') {
          const message = this.getNodeParameter('formatMessage', i) as string;
          const style = this.getNodeParameter('instagramStyle', i) as string;
          const addEmojis = this.getNodeParameter('instagramEmojis', i) as boolean;
          const maxHashtags = this.getNodeParameter('instagramMaxHashtags', i) as number;

          let caption = message;

          // Style-based formatting
          if (addEmojis) {
            const styleEmojis: Record<string, string[]> = {
              professional: ['💼', '📊', '✨', '🎯', '💡'],
              casual: ['😊', '🙌', '❤️', '✌️', '🔥'],
              storytelling: ['📖', '🌟', '💫', '🎬', '✨'],
              educational: ['📚', '🎓', '💡', '🧠', '📝'],
            };

            const emojis = styleEmojis[style] || styleEmojis.professional;

            // Add opening emoji
            caption = `${emojis[Math.floor(Math.random() * emojis.length)]} ${caption}`;

            // Add section emojis
            caption = caption.replace(/\n\n/g, `\n\n${emojis[Math.floor(Math.random() * emojis.length)]} `);
          }

          // Instagram caption limit is 2200 chars
          caption = caption.substring(0, 2200 - (maxHashtags * 15)); // Leave room for hashtags

          // Add placeholder for hashtags
          if (maxHashtags > 0) {
            caption += '\n\n.\n.\n.\n'; // Instagram hashtag separator trick
            caption += `[${maxHashtags} hashtag eklenecek]`;
          }

          returnData.push({
            json: {
              caption,
              style,
              characterCount: caption.length,
              maxHashtags,
              platform: 'instagram',
            },
          });
        }

        // ===================
        // GENERATE HASHTAGS (AI)
        // ===================
        else if (operation === 'generateHashtags') {
          const content = this.getNodeParameter('aiContent', i) as string;
          const platform = this.getNodeParameter('aiPlatform', i) as string;
          const language = this.getNodeParameter('aiLanguage', i) as string;
          const count = this.getNodeParameter('hashtagCount', i) as number;

          const openaiKey = credentials.openaiApiKey as string;
          if (!openaiKey) {
            throw new Error('OpenAI API key is required for hashtag generation');
          }

          const openai = new OpenAI({ apiKey: openaiKey });

          const platformGuide: Record<string, string> = {
            twitter: 'Twitter/X için kısa ve trend hashtag\'ler (2-3 kelime max)',
            linkedin: 'LinkedIn için profesyonel ve sektörel hashtag\'ler',
            instagram: 'Instagram için popüler ve keşfedilebilir hashtag\'ler',
            facebook: 'Facebook için genel ve anlaşılır hashtag\'ler',
            general: 'Genel sosyal medya kullanımı için hashtag\'ler',
          };

          const languageGuide = language === 'tr' ? 'Türkçe' : language === 'en' ? 'İngilizce' : 'içerikle aynı dilde';

          const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: `Sen bir sosyal medya hashtag uzmanısın. ${platformGuide[platform]}. Hashtag'leri ${languageGuide} oluştur. Sadece hashtag'leri döndür, başka açıklama ekleme.`,
              },
              {
                role: 'user',
                content: `Aşağıdaki içerik için ${count} adet ilgili hashtag oluştur:\n\n${content}`,
              },
            ],
            temperature: 0.7,
          });

          const hashtagText = response.choices[0].message.content || '';
          const hashtags = hashtagText
            .split(/[\s,\n]+/)
            .filter(tag => tag.startsWith('#'))
            .slice(0, count);

          returnData.push({
            json: {
              hashtags,
              hashtagString: hashtags.join(' '),
              count: hashtags.length,
              platform,
              language,
            },
          });
        }

        // ===================
        // GENERATE CAPTION (AI)
        // ===================
        else if (operation === 'generateCaption') {
          const content = this.getNodeParameter('aiContent', i) as string;
          const platform = this.getNodeParameter('aiPlatform', i) as string;
          const language = this.getNodeParameter('aiLanguage', i) as string;
          const style = this.getNodeParameter('captionStyle', i) as string;
          const includeHashtags = this.getNodeParameter('captionIncludeHashtags', i) as boolean;

          const openaiKey = credentials.openaiApiKey as string;
          if (!openaiKey) {
            throw new Error('OpenAI API key is required for caption generation');
          }

          const openai = new OpenAI({ apiKey: openaiKey });

          const platformLimits: Record<string, number> = {
            twitter: 280,
            linkedin: 3000,
            instagram: 2200,
            facebook: 63206,
            general: 1000,
          };

          const styleGuides: Record<string, string> = {
            professional: 'Profesyonel, ciddi ve bilgilendirici bir ton kullan',
            casual: 'Samimi, arkadaşça ve rahat bir ton kullan',
            witty: 'Esprili, zekice ve eğlenceli bir ton kullan',
            inspirational: 'İlham verici, motive edici ve pozitif bir ton kullan',
            educational: 'Öğretici, açıklayıcı ve bilgi paylaşan bir ton kullan',
          };

          const languageGuide = language === 'tr' ? 'Türkçe' : language === 'en' ? 'İngilizce' : 'içerikle aynı dilde';
          const charLimit = platformLimits[platform] || 1000;

          const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content: `Sen bir sosyal medya içerik yazarısın. ${styleGuides[style]}. Caption'ı ${languageGuide} yaz. Maksimum ${charLimit} karakter. ${includeHashtags ? 'Sonuna 5-10 ilgili hashtag ekle.' : 'Hashtag ekleme.'}`,
              },
              {
                role: 'user',
                content: `Aşağıdaki içerik için ${platform} platformuna uygun bir caption yaz:\n\n${content}`,
              },
            ],
            temperature: 0.8,
          });

          const caption = response.choices[0].message.content || '';

          returnData.push({
            json: {
              caption,
              characterCount: caption.length,
              platform,
              style,
              language,
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
