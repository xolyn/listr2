## Usage
Cloudflare -> Workers -> New worker -> Start from 'hello world' -> Edit code -> Paste code in `worker.js` -> Deploy -> Back: Connect -> Set environment variable -> Variable Name: `R2` -> Done connecting R2 -> Deploy again -> Enjoy

## Environmental variable
- `R2`: soft-mandatory, the bucket you want to show files thereof
- `ROOT`: optional: the root url of your bucket, which, after specified, will change the href attribute of files to `<ROOT>/<structure of certain R2 file in the bucket>`. Can be any one of the following formats: `https://example.com`, `example.com`, `example.com/`.
> The following 2 variables needs to be defined simultaneously to activate <a href="https://en.wikipedia.org/wiki/Basic_access_authentication">basic authentication</a>
- `USERNAME`: username, to be validated with "username" field from credential prompt box
- `PASSWORD`: password, to be validated with "password" field from credential prompt box
