## Package Manager

You must use `yarn` instead of `npm` for managing dependencies. To install dependencies, run:

```bash
yarn install
```

You must also use `yarn` for running scripts defined in `package.json`. For example, to run tests, use:

```bash
yarn test
```

When testing changes in the CLI, use the `prettier` package.json script instead of invoking the plugin manually.
