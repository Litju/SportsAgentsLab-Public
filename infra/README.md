# Infrastructure boundary

ML-94 reserves infra/ for deployment configuration without adding a provider,
container, database, storage, authentication, tenancy, or workflow runtime.

Infrastructure may depend on declared build/package outputs in a later bounded
issue. It must not contain domain or scientific business logic. Provider
selection and deployment manifests remain deferred until a later issue has a
concrete requirement and authority evidence.
