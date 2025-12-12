
export interface AppFeature {
  id: string;
  title: string;
  shortDescription: string;
  systemInstruction: string;
  initialMessage: string;
  inputPlaceholder: string;
  icon: string;
  category: 'Health' | 'Lifestyle' | 'Social' | 'Utility' | 'Education';
  color: string;
  bgColor: string;
}

export interface ChatMessage {
  role: 'user' | 'model';
  text: string;
  image?: string; // Base64 string of the file (raw, no data URI prefix)
  mimeType?: string; // MIME type of the file (e.g., 'image/jpeg', 'application/pdf')
  timestamp: number;
}
