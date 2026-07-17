If TypeScript cannot infer JSON message modules, ensure
`tsconfig.json` contains:

```json
{
  "compilerOptions": {
    "resolveJsonModule": true
  }
}
```
