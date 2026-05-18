import { defineConfig } from 'theokit'

export default defineConfig({
  upload: {
    maxFileSize: 10 * 1024 * 1024, // 10 MB
    maxFiles: 5,
  },
})
