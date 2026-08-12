ALTER TABLE user_api_keys
ADD COLUMN base_url TEXT NOT NULL DEFAULT 'https://api.openai.com/v1';

ALTER TABLE user_api_keys
ADD COLUMN model TEXT NOT NULL DEFAULT 'gpt-4.1-mini';
