import dotenv from 'dotenv';
import { expand } from 'dotenv-expand';

// Load test environment variables from .env.test file;
expand(dotenv.config({ path: '.env.test' }));
