# Firebase 프로젝트 분리 규칙

## ⚠️ 중요: V1 vs V2 분리

| 항목 | V1 (실무) | V2 (개발) |
|------|-----------|-----------|
| 폴더 | 01_jbg-cbm-checker | 02_jbg-cbm-checker |
| 프로젝트 ID | `new-prototype-z7yp8` | `jbg-cbm-checker` |
| 개발 도구 | Firebase AI Studio | Antigravity |
| 상태 | 🔴 운영 중 | 🟢 개발 중 |

## 핵심 규칙

**Firebase Console은 공유하지만, 프로젝트 ID만 겹치지 않으면 됨**

- V1과 V2는 **다른 도구**로 개발하므로 충돌 가능성 낮음
- 단, Firebase 배포 시 **프로젝트 ID 확인 필수**

## V2 작업 시 확인사항

1. **`.firebaserc` 확인**: `jbg-cbm-checker`인지 확인
2. **배포 대상 확인**: `Deploying to 'jbg-cbm-checker'...` 메시지 확인
3. **절대 `new-prototype-z7yp8`로 배포하지 않기**

## Firebase 배포 체크리스트

```bash
# 1. 프로젝트 확인
cat .firebaserc  # "default": "jbg-cbm-checker" 확인

# 2. 배포 (메시지에서 프로젝트 ID 확인!)
npx firebase deploy --only firestore:rules
# ==> Deploying to 'jbg-cbm-checker'... 확인 필수
```

