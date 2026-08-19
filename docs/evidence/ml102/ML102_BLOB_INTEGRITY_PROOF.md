# ML-102 Vercel Blob Integrity Proof

The configured artifact store is Vercel Private Blob. The post-fix protected
Preview qualification ran against commit `268e9afac538743ccb36a19e4dafb6bd8f44d8a3`.

```text
BYTE_SIZE=56
SHA256=0eb0aabcc4d1c4f1b9e228d678bcf37bd42367041527ff1aa1501047f92efa96
CONTENT_TYPE=text/csv
AUTHORIZED_SOURCE_ROUTE=HTTP_200
PRIVATE_STORAGE_CONFIGURED=YES
HOSTED_AUTHENTICATION=PASS
HOSTED_AUTHENTICATED_BROWSER_E2E=PASS
FIRST_ATTEMPT=imp_b21f36ba6a844b26b07b429eae13f8e1
DUPLICATE_ATTEMPT=imp_0e1370d6ce7d4ff296d29fa2630ea0c5
DUPLICATE_OF=imp_b21f36ba6a844b26b07b429eae13f8e1
UNSUPPORTED_ATTEMPT=imp_6bc3b769b8524bcb9283bc7335109a55
UNSUPPORTED_STATE=UNSUPPORTED
ANONYMOUS_SOURCE_ROUTE=HTTP_401
CROSS_TENANT_DETAIL=HTTP_404
CROSS_TENANT_ORIGINAL=NO_BYTES_RETURNED
```

The server, not the browser, calculated the identity and the authenticated
browser received the exact 56 bytes from the private source route. Two
different filenames produced separate attempts with the same content hash;
the second attempt was linked to the first by content identity. The staged
object was materialized under the content-addressed key and the original
filename was retained as provenance. Tokens and signed upload credentials are
intentionally absent from this evidence.
