{
  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/release-25.05";
  };
  outputs =
    {
      self,
      nixpkgs,
    }:

    # flake multi system boilerplate begins
    let
      supportedSystems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
      ];

      # We vendor these three functions so we don't have to depend on nixpkgs
      # just to get `lib` to define `eachSystem`:
      mergeAttrs = x: y: x // y;

      foldr =
        op: nul: list:
        let
          len = builtins.length list;
          fold' = n: if n == len then nul else op (builtins.elemAt list n) (fold' (n + 1));
        in
        fold' 0;

      foldAttrs =
        op: nul: list_of_attrs:
        foldr (
          n: a: foldr (name: o: o // { ${name} = op n.${name} (a.${name} or nul); }) a (builtins.attrNames n)
        ) { } list_of_attrs;
      eachSystem =
        f:
        foldAttrs mergeAttrs { } (map (s: builtins.mapAttrs (_: v: { ${s} = v; }) (f s)) supportedSystems);
      # flake multi system boilerplate ends

    in
    eachSystem (
      system:
      let
        pkgs = import nixpkgs {
          inherit system;
        };
        dtvDepHash = "sha256-WKVHBTaClfR1L2yETRJRyurSi6Fdl4Rbmw2XdGlWlaw=";
        dtv =
          (pkgs.buildNpmPackage {
            name = "declarative-table-views";
            npmPackFlags = [ "--ignore-scripts" ];
            src = ./.;
            npmDepsHash = dtvDepHash;
            makeCacheWriteable = true;
          }).overrideAttrs
            (old: {
              installPhase = ''
                mkdir "$out"
                cp -R "dist/" "$out/"
              '';
            });
      in
      {
        packages = {
          default = dtv;
        };
        checks = {
          lint =
            (pkgs.buildNpmPackage {
              name = "lint-dtv";
              npmPackFlags = [ "--ignore-scripts" ];
              src = ./.;
              npmDepsHash = dtvDepHash;
              makeCacheWriteable = true;
            }).overrideAttrs
              (old: {
                buildPhase = ''
                  npm run lint
                '';
                installPhase = ''
                  echo "Nothing to do" > $out
                '';
                dontCheck = true;
              });
          test-unit =
            (pkgs.buildNpmPackage {
              name = "test-unit-dtv";
              npmPackFlags = [ "--ignore-scripts" ];
              src = ./.;
              npmDepsHash = dtvDepHash;
              makeCacheWriteable = true;
            }).overrideAttrs
              (old: {
                buildPhase = ''
                  npm run test-unit
                '';
                installPhase = ''
                  echo "Nothing to do" > $out
                '';
                dontCheck = true;
              });
        };
        formatter = nixpkgs.legacyPackages.x86_64-linux.nixfmt-tree;
      }
    );
}
