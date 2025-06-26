import fs from "node:fs";
import path from "node:path";
import yaml from "yaml";

const patchBasePath = fs.existsSync("./ChilloutVR_Data")
  ? "./ChilloutVR_Data"
  : "../ChilloutVR_Data";

const cvrBasePath = fs
  .readFileSync(
    fs.existsSync("./cvrBasePath.txt")
      ? "./cvrBasePath.txt"
      : "../cvrBasePath.txt",
    "utf-8",
  )
  .trim();

const patchHtmlBasePaths = [
  "StreamingAssets/Cohtml/UIResources/CVRTest",
  "StreamingAssets/Cohtml/UIResources/GameUI",
];

const cvrTestTranslationsPath = path.join(
  patchBasePath,
  "..",
  "cvrtest-translations.yaml",
);

const cvrTestIndex = path.join(
  cvrBasePath,
  "StreamingAssets/Cohtml/UIResources/CVRTest/index.html",
);

const gameUiTranslationsPath = path.join(
  patchBasePath,
  "..",
  "gameui-translations.yaml",
);

const englishTranslationJsPath = path.join(
  cvrBasePath,
  "StreamingAssets/Cohtml/UIResources/GameUI/translations/english.translation.js",
);

if (!fs.existsSync(cvrBasePath)) {
  console.error(
    "ChilloutVRが見付かりません。Steamのインストール先を確認してください。\n",
  );
  await new Promise((resolve) => {
    setTimeout(resolve, 60000);
  });
  process.exit(1);
}

function paths(file: fs.Dirent) {
  const patchFilePath = path.join(file.parentPath, file.name);
  const relativePath = path.relative(patchBasePath, patchFilePath);
  const cvrFilePath = path.join(cvrBasePath, relativePath);
  return { patchFilePath, relativePath, cvrFilePath };
}

async function eachFile(
  basePath: string,
  callback: (file: fs.Dirent) => void | PromiseLike<void>,
) {
  for (const file of await fs.promises.readdir(basePath, {
    recursive: true,
    withFileTypes: true,
  })) {
    if (file.isFile()) {
      await callback(file);
    }
  }
}

const dataMarker = `<!-- cvr-jp:data-v1 -->`;

const patchMarkRewriter = new HTMLRewriter().on("html", {
  element(element) {
    element.append(dataMarker, {
      html: true,
    });
  },
});
const patchHtmlFontRewriter = new HTMLRewriter().on("head", {
  element(element) {
    element.append(`<link rel="stylesheet" href="ui-font.css">`, {
      html: true,
    });
  },
});
const translations = yaml.parse(
  fs.readFileSync(cvrTestTranslationsPath, "utf-8"),
) as Record<string, string | undefined>;
const patchTranslationRewriter = new HTMLRewriter().on("*", {
  text(text) {
    const t = translations[text.text] || translations[text.text.trim()];
    if (t) {
      text.replace(t);
    }
  },
});

await eachFile(patchBasePath, async (file) => {
  if (file.name.endsWith(".html")) return;
  const { patchFilePath, cvrFilePath } = paths(file);
  console.log(`コピー ${patchFilePath}\n    => ${cvrFilePath}`);
  await fs.promises.copyFile(patchFilePath, cvrFilePath);
});

let alreadyPatched = false;

for (const patchHtmlBasePath of patchHtmlBasePaths) {
  const patchHtmlPath = path.join(cvrBasePath, patchHtmlBasePath);
  await eachFile(patchHtmlPath, async (file) => {
    if (!file.name.endsWith(".html")) return;
    const filePath = path.join(file.parentPath, file.name);
    console.log(`パッチ ${filePath}`);
    const content = await fs.promises.readFile(filePath, "utf-8");
    if (content.includes(dataMarker)) {
      console.error(`=> 既にパッチ済みのためスキップ`);
      alreadyPatched = true;
      return;
    }
    let result = patchHtmlFontRewriter.transform(content);
    if (filePath === cvrTestIndex) {
      result = patchTranslationRewriter.transform(result);
    }
    result = patchMarkRewriter.transform(result);
    await fs.promises.writeFile(filePath, result, "utf-8");
  });
}

console.log(`Patching ${englishTranslationJsPath}`);
const gameUiTranslations = yaml.parse(
  fs.readFileSync(gameUiTranslationsPath, "utf-8"),
) as Record<string, string | undefined>;
const jsContent = fs.readFileSync(englishTranslationJsPath, "utf-8");
const jsContentReplaced = jsContent
  .replace(
    /^(?:const ja = {[^\n]*};)?(cvr\.registerNewLanguage)/,
    `const ja = ${JSON.stringify(gameUiTranslations)};$1`,
  )
  .replace(/^}\);/m, `...ja});`);
fs.writeFileSync(englishTranslationJsPath, jsContentReplaced, "utf-8");

console.warn("\n■■■ パッチを当てました。このウインドウは閉じて下さい。 ■■■\n");
if (alreadyPatched) {
  console.error(
    "[注意]既にパッチが当たっていました。\n新しいパッチを当てた場合正しく適用されない場合があります。\nSteamライブラリのChilloutVRの管理（歯車メニュー）から「インストール済みファイル」→「ゲームファイルの整合性を確認」を一度実行してから、改めてこのパッチを当てて下さい。",
  );
}
await new Promise((resolve) => {
  setTimeout(resolve, 60000);
});
