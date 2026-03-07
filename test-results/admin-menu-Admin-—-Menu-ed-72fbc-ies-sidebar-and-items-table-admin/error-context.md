# Page snapshot

```yaml
- generic [ref=e2]:
  - link "Sally's Bar Sally's Bar" [ref=e3] [cursor=pointer]:
    - /url: /
    - img "Sally's Bar" [ref=e4]
    - generic [ref=e5]: Sally's Bar
  - generic [ref=e6]:
    - heading "Sign In" [level=1] [ref=e7]
    - generic [ref=e8]:
      - generic [ref=e9]:
        - generic [ref=e10]: Email
        - textbox "Email" [ref=e11]:
          - /placeholder: you@example.com
      - generic [ref=e12]:
        - generic [ref=e13]: Password
        - textbox "Password" [ref=e14]:
          - /placeholder: ••••••••
      - paragraph [ref=e17]: Complete the security check above to sign in.
      - button "Sign In" [disabled] [ref=e18] [cursor=pointer]
      - link "Forgot password?" [ref=e19] [cursor=pointer]:
        - /url: /forgot-password
    - generic [ref=e22]: or
    - button "Continue with Google" [ref=e24] [cursor=pointer]:
      - img [ref=e25]
      - text: Continue with Google
    - paragraph [ref=e30]:
      - text: Don't have an account?
      - link "Register" [ref=e31] [cursor=pointer]:
        - /url: /register
```