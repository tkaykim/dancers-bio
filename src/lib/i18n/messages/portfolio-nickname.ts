import type { Messages } from '../t';
const ko = {
  title: '내 링크 닉네임', hint: '인스타에 걸어둘 주소를 정해 주세요.\n영문 소문자·숫자·하이픈으로 2~40자까지 쓸 수 있습니다.',
  useName: '활동명으로 설정', changeHint: '주소를 바꾸면 인스타 등에 올린 기존 링크도 새 주소로 바꿔 주세요.',
  save: '이 닉네임으로 저장', saving: '저장 중…', saved: '닉네임 주소를 저장했습니다.',
  invalid: '사용할 수 없는 닉네임입니다.\n영문 소문자·숫자·하이픈 2~40자로 입력해 주세요.',
  taken: '이미 사용 중인 닉네임입니다.\n숫자를 자동으로 붙이지 않으니 다른 닉네임을 골라 주세요.', failed: '주소를 저장하지 못했습니다.\n다시 시도해 주세요.',
};
type Key = keyof typeof ko;
const en: Record<Key,string> = {title:'Your link nickname',hint:'Choose the address for your Instagram bio.\nUse 2–40 lowercase letters, numbers or hyphens.',useName:'Use stage name',changeHint:'After changing your address, update existing links in your Instagram bio and elsewhere.',save:'Save this nickname',saving:'Saving…',saved:'Nickname address saved.',invalid:'This nickname cannot be used.\nUse 2–40 lowercase letters, numbers or hyphens.',taken:'This nickname is already taken.\nChoose another nickname; no numbers are added automatically.',failed:'Could not save your address.\nPlease try again.'};
const ja: Record<Key,string> = {title:'リンクのニックネーム',hint:'Instagramに載せるアドレスを決めましょう。\n英小文字・数字・ハイフンで2〜40文字まで使えます。',useName:'活動名を使う',changeHint:'アドレスを変更したら、Instagramなどの既存リンクも新しいアドレスに更新してください。',save:'このニックネームで保存',saving:'保存中…',saved:'アドレスを保存しました。',invalid:'このニックネームは使えません。\n英小文字・数字・ハイフンで2〜40文字を入力してください。',taken:'このニックネームは使用中です。\n数字は自動追加しないので別のニックネームを選んでください。',failed:'保存できませんでした。\nもう一度お試しください。'};
export default {ko,en,ja} satisfies Messages<Key>;
