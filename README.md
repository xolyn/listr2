## Highlights
- Minimalism design with minimal code and all native HTML functionalities to ensure compatibility
- Show hierarchical structures (native HTML details attribute)
- Show folder and file sizes while being hovered (native HTML title attribute)
- HTML native basic authentication
- Visual improvement
- EXTREMELY basic bucket statistics
  ...coming in future version:
- [] "Delete items" functionalities
- [] Display create time/update time
- [] Maybe not: "Upload items"
- [] Suggestions? Submit a [PR](https://github.com/xolyn/listr2/pulls)

## Usage
Cloudflare -> Workers -> New worker -> Start from 'hello world' -> Edit code -> Paste code in `worker.js` -> Deploy -> Back: Connect -> Variable Name: `R2` -> Done connecting R2 -> Deploy again -> Enjoy
  
## Visual demo
<img width="1424" height="884" alt="image" src="https://github.com/user-attachments/assets/c43c1ed6-a270-479d-9383-a2bcc75870b6" />

## Environmental variable
- `R2`: soft-mandatory, the bucket you want to show files thereof
- `ROOT`: optional: the root url of your bucket, which, after specified, will change the href attribute of files to `<ROOT>/<structure of certain R2 file in the bucket>`. Can be any one of the following formats: `https://example.com`, `example.com`, `example.com/`.
> The following 2 variables needs to be defined simultaneously to activate [basic authentication](https://en.wikipedia.org/wiki/Basic_access_authentication)
- `USERNAME`: username, to be validated with "username" field from credential prompt box
- `PASSWORD`: password, to be validated with "password" field from credential prompt box
