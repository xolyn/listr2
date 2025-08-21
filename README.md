## Usage
Cloudflare -> Workers -> New worker -> Start from 'hello world' -> Edit code -> Paste code in `worker.js` -> Deploy -> Back: Connect -> Set environment variable -> Variable Name: `R2` -> Done connecting R2 -> Deploy again -> Enjoy

## Environmental variable
`R2`: soft-mandatory, the bucket you want to show files thereof
`ROOT`: optional: the root url of your bucket, which, after specified, will change the href attribute of files to `<ROOT>/<structure of some R2 file in the bucket>`. Can be any of this format: `https://myr2.com`, `myr2.com`, `myr2.com/`. 
