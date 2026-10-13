export type Category = 'chat' | 'generate' | 'edit'
export type Adapter = 'chat' | 'reasoning' | 'o1' | 'banana' | 'banana-pro' | 'banana-fixed' | 'gpt-image'
export interface Model { id: string; categories: Category[]; adapter: Adapter | ''; source: 'api' | 'custom' }
export interface Config {
  baseUrl: string; models: Model[]; defaults: Record<Category, string>;
  theme: 'system' | 'light' | 'dark'; stream: boolean
}
export interface Message {
  id: string; role: 'user' | 'assistant'; content: string; model?: string;
  status?: 'complete' | 'pending' | 'interrupted' | 'failed'; error?: string
}
export interface Conversation { id: string; title: string; model: string; messages: Message[]; updated: number }
export interface ImageResult { src: string; revisedPrompt?: string }
