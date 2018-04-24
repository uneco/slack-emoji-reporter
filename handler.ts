// tslint:disable-next-line:no-implicit-dependencies
import { Handler } from 'aws-lambda'

// tslint:disable-next-line:no-implicit-dependencies
import { S3, AWSError } from 'aws-sdk'
import * as Slack from 'slack-node'

const slack = new Slack(process.env.SLACK_API_KEY)
const bot = new Slack(process.env.SLACK_BOT_KEY)
const s3 = new S3()

interface IEmojiData {
  emojis: string[],
}

async function loadLatestStoredData (): Promise<IEmojiData> {
  try {
    const data = await s3.getObject({
      Bucket: process.env.DATA_BUCKET!,
      Key: 'data.json',
    }).promise()
    if (!data.Body) {
      return {
        emojis: [],
      }
    }
    return JSON.parse(data.Body.toString())
  } catch (err) {
    const error: AWSError = err
    if (error.code === 'NoSuchKey') {
      return {
        emojis: [],
      }
    }
    throw error
  }
}

async function storeData (data: IEmojiData) {
  return s3.putObject({
    Bucket: process.env.DATA_BUCKET!,
    Key: 'data.json',
    Body: JSON.stringify(data),
  }).promise()
}

async function loadLatestWorkspaceEmojis (): Promise<string[]> {
  return new Promise<string[]>((resolve, reject) => {
    slack.api('emoji.list', (err, data) => {
      err ? reject(err) : resolve(Object.keys(data.emoji))
    })
  })
}

async function sendMessage (text: string): Promise<any> {
  return new Promise<void>((resolve, reject) => {
    const channel = process.env.SLACK_CHANNEL
    bot.api('chat.postMessage', { channel, text }, (err, response) => {
      err ? reject(err) : resolve(response)
    })
  })
}

export const run: Handler = async () => {
  const storedData = await loadLatestStoredData()
  const currentEmojis = await loadLatestWorkspaceEmojis()
  const storedEmojis = new Set(storedData.emojis)
  const newEmojis = currentEmojis.filter((emoji) => !storedEmojis.has(emoji))

  if (newEmojis.length > 0) {
    const text = [
      '新しく追加された絵文字:',
      newEmojis.map((emoji) => `:${emoji}: *${emoji}*`).join('\n'),
    ].join('\n')
    await sendMessage(text)
  }

  await storeData({ emojis: currentEmojis })
  return { ok: 1, newEmojis }
}
