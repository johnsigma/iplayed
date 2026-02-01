import 'dotenv/config';
import { app } from 'shared/infra/http/app';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`📡 Endpoint: http://localhost:${PORT}/api/v1/status`);
});
