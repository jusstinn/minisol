#!/bin/bash
# API robustness probes: malformed JSON, wrong types, prototype-key tenants, absurd sizes.
# Every line should be a 2xx/4xx with a clean JSON error — never a 500 or a stack trace.
# Usage: bash scripts/qa/api-robustness.sh [base-url]   (dev server started with AGENT_MODE=scripted)
B=${1:-http://localhost:3310}
t() {
  local name="$1"; shift
  local out code body
  out=$(curl -s -m 60 -w "\n__%{http_code}" "$@")
  code=${out##*__}
  body=${out%__*}
  printf "%-34s %s  %s\n" "$name" "$code" "$(echo "$body" | head -c 170 | tr '\n' ' ')"
}
H='Content-Type: application/json'
M='"memberId":"WL-RO-100231"'
echo "== /api/chat"
t "malformed" -X POST $B/api/chat -H "$H" -d '{bad'
t "null body" -X POST $B/api/chat -H "$H" -d 'null'
t "array body" -X POST $B/api/chat -H "$H" -d '[]'
t "string body" -X POST $B/api/chat -H "$H" -d '"hi"'
t "message number" -X POST $B/api/chat -H "$H" -d "{\"message\":5,$M}"
t "message object" -X POST $B/api/chat -H "$H" -d "{\"message\":{\"a\":1},$M}"
t "no member" -X POST $B/api/chat -H "$H" -d '{"message":"salut"}'
t "unknown member" -X POST $B/api/chat -H "$H" -d '{"message":"salut","memberId":"nope"}'
t "member object" -X POST $B/api/chat -H "$H" -d '{"message":"salut","memberId":{"x":1}}'
t "tenant number" -X POST $B/api/chat -H "$H" -d "{\"message\":\"salut\",$M,\"tenant\":5}"
t "tenant constructor" -X POST $B/api/chat -H "$H" -d "{\"message\":\"salut\",$M,\"tenant\":\"constructor\"}"
t "tenant __proto__" -X POST $B/api/chat -H "$H" -d "{\"message\":\"salut\",$M,\"tenant\":\"__proto__\"}"
t "lang xx" -X POST $B/api/chat -H "$H" -d "{\"message\":\"salut\",$M,\"lang\":\"xx\",\"mode\":\"scripted\"}"
t "lang number" -X POST $B/api/chat -H "$H" -d "{\"message\":\"Vreau o terasa 4x3\",$M,\"lang\":7,\"mode\":\"scripted\"}"
t "state string" -X POST $B/api/chat -H "$H" -d "{\"message\":\"salut\",$M,\"state\":\"x\",\"mode\":\"scripted\"}"
t "state bad project" -X POST $B/api/chat -H "$H" -d "{\"message\":\"Variantă mai ieftină\",$M,\"state\":{\"basket\":{\"a\":1},\"project\":{\"type\":\"deck\",\"inputs\":{\"lengthM\":-4}}},\"mode\":\"scripted\"}"
t "state project inputs str" -X POST $B/api/chat -H "$H" -d "{\"message\":\"Vreau premium\",$M,\"state\":{\"basket\":[],\"project\":{\"type\":\"fence\",\"inputs\":\"zz\"}},\"mode\":\"scripted\"}"
t "state project huge steps" -X POST $B/api/chat -H "$H" -d "{\"message\":\"Vreau premium\",$M,\"state\":{\"basket\":[],\"project\":{\"type\":\"deck\",\"inputs\":{\"lengthM\":4,\"widthM\":3,\"steps\":[{\"count\":1e12,\"width\":1e9}]}}},\"mode\":\"scripted\"}"
t "state basket sku num" -X POST $B/api/chat -H "$H" -d "{\"message\":\"Ce oferte am?\",$M,\"state\":{\"basket\":[{\"sku\":1,\"qty\":2},{\"sku\":\"zzz\",\"qty\":-5},{\"sku\":\"zzz2\",\"qty\":1e30}],\"project\":{\"type\":\"deck\",\"inputs\":{}}},\"mode\":\"scripted\"}"
t "history string" -X POST $B/api/chat -H "$H" -d "{\"message\":\"salut\",$M,\"history\":\"x\",\"mode\":\"scripted\"}"
t "history nulls" -X POST $B/api/chat -H "$H" -d "{\"message\":\"nu stiu dimensiunile\",$M,\"history\":[null,1,\"a\"],\"mode\":\"scripted\"}"
t "absurd deck" -X POST $B/api/chat -H "$H" -d "{\"message\":\"terasa 99999 x 3\",$M,\"mode\":\"scripted\"}"
t "negative deck" -X POST $B/api/chat -H "$H" -d "{\"message\":\"terasa -4 x 3\",$M,\"mode\":\"scripted\"}"
t "zero fence" -X POST $B/api/chat -H "$H" -d "{\"message\":\"gard de 0 m\",$M,\"mode\":\"scripted\"}"
echo "== /api/quote"
t "malformed" -X POST $B/api/quote -H "$H" -d '{bad'
t "empty" -X POST $B/api/quote -H "$H" -d '{}'
t "items not array" -X POST $B/api/quote -H "$H" -d "{$M,\"items\":5}"
t "items null entries" -X POST $B/api/quote -H "$H" -d "{$M,\"items\":[null,1,\"a\",{\"sku\":null}]}"
t "unknown sku" -X POST $B/api/quote -H "$H" -d "{$M,\"items\":[{\"sku\":\"NOPE\",\"qty\":2}]}"
t "neg qty" -X POST $B/api/quote -H "$H" -d "{$M,\"items\":[{\"sku\":\"NOPE\",\"qty\":-2}]}"
t "tenant number" -X POST $B/api/quote -H "$H" -d "{$M,\"tenant\":1,\"items\":[]}"
t "tenant toString" -X POST $B/api/quote -H "$H" -d "{$M,\"tenant\":\"toString\",\"items\":[]}"
t "unknown store" -X POST $B/api/quote -H "$H" -d "{$M,\"storeId\":\"mars\",\"items\":[]}"
t "bad role" -X POST $B/api/quote -H "$H" -d "{$M,\"items\":[{\"sku\":\"x\",\"qty\":1,\"role\":\"__proto__\"}]}"
t "lang xx" -X POST $B/api/quote -H "$H" -d "{$M,\"lang\":\"xx\",\"items\":[]}"
echo "== /api/sketch"
t "malformed" -X POST $B/api/sketch -H "$H" -d '{bad'
t "empty" -X POST $B/api/sketch -H "$H" -d '{}'
t "edits no state" -X POST $B/api/sketch -H "$H" -d "{$M,\"edits\":[{\"op\":\"resize\",\"w\":5,\"d\":4}]}"
t "edits null" -X POST $B/api/sketch -H "$H" -d "{$M,\"edits\":[null],\"state\":{\"project\":{\"type\":\"deck\",\"inputs\":{\"lengthM\":4,\"widthM\":3}}}}"
t "resize absurd" -X POST $B/api/sketch -H "$H" -d "{$M,\"edits\":[{\"op\":\"resize\",\"zone\":\"A\",\"w\":1e9,\"d\":-4}],\"state\":{\"project\":{\"type\":\"deck\",\"inputs\":{\"lengthM\":4,\"widthM\":3}}}}"
t "resize strings" -X POST $B/api/sketch -H "$H" -d "{$M,\"edits\":[{\"op\":\"resize\",\"zone\":\"A\",\"w\":\"abc\",\"d\":{}}],\"state\":{\"project\":{\"type\":\"deck\",\"inputs\":{\"lengthM\":4,\"widthM\":3}}}}"
t "steps huge" -X POST $B/api/sketch -H "$H" -d "{$M,\"edits\":[{\"op\":\"add_steps\",\"zone\":\"A\",\"side\":\"s\",\"count\":1e9}],\"state\":{\"project\":{\"type\":\"deck\",\"inputs\":{\"lengthM\":4,\"widthM\":3}}}}"
t "wrong op for type" -X POST $B/api/sketch -H "$H" -d "{$M,\"edits\":[{\"op\":\"add_fence_segment\",\"length\":5}],\"state\":{\"project\":{\"type\":\"deck\",\"inputs\":{\"lengthM\":4,\"widthM\":3}}}}"
t "fence seg absurd" -X POST $B/api/sketch -H "$H" -d "{$M,\"edits\":[{\"op\":\"add_fence_segment\",\"length\":1e6,\"turn\":\"right\"}],\"state\":{\"project\":{\"type\":\"fence\",\"inputs\":{\"lengthM\":10}}}}"
t "set_height neg" -X POST $B/api/sketch -H "$H" -d "{$M,\"edits\":[{\"op\":\"set_height\",\"value\":-3}],\"state\":{\"project\":{\"type\":\"deck\",\"inputs\":{\"lengthM\":4,\"widthM\":3}}}}"
t "undo empty" -X POST $B/api/sketch -H "$H" -d "{$M,\"edits\":[{\"op\":\"undo\"}],\"state\":{\"project\":{\"type\":\"deck\",\"inputs\":{\"lengthM\":4,\"widthM\":3}}}}"
t "bad layout in state" -X POST $B/api/sketch -H "$H" -d "{$M,\"edits\":[{\"op\":\"resize\",\"zone\":\"A\",\"w\":5,\"d\":4}],\"state\":{\"project\":{\"type\":\"deck\",\"inputs\":{\"lengthM\":4,\"widthM\":3},\"layout\":{\"type\":\"deck\",\"zones\":\"x\"}}}}"
t "bad layout bad inputs" -X POST $B/api/sketch -H "$H" -d "{$M,\"edits\":[{\"op\":\"resize\",\"zone\":\"A\",\"w\":5,\"d\":4}],\"state\":{\"project\":{\"type\":\"deck\",\"inputs\":{\"lengthM\":-4},\"layout\":{\"type\":\"deck\",\"zones\":\"x\"}}}}"
t "state project null" -X POST $B/api/sketch -H "$H" -d "{$M,\"edits\":[{\"op\":\"resize\",\"w\":5,\"d\":4}],\"state\":{\"project\":null}}"
t "state null" -X POST $B/api/sketch -H "$H" -d "{$M,\"edits\":[{\"op\":\"resize\",\"w\":5,\"d\":4}],\"state\":null}"
t "tenant number" -X POST $B/api/sketch -H "$H" -d "{$M,\"tenant\":3,\"edits\":[]}"
echo "== /api/product"
t "no sku" $B/api/product
t "bad sku" "$B/api/product?sku=%3Cscript%3E"
t "unknown sku" "$B/api/product?sku=NOPE"
t "bad lang" "$B/api/product?sku=NOPE&lang=de"
t "unknown store" "$B/api/product?sku=NOPE&storeId=mars"
t "tenant constructor" "$B/api/product?sku=NOPE&tenant=constructor"
t "tenant hasOwnProperty" "$B/api/product?sku=NOPE&tenant=hasOwnProperty"
echo "== /api/members"
t "default" "$B/api/members"
t "tenant constructor" "$B/api/members?tenant=constructor"
t "tenant valueOf" "$B/api/members?tenant=valueOf"
t "POST" -X POST $B/api/members
echo "== pages"
t "home retailer constructor" "$B/?retailer=constructor"
t "pitch retailer constructor" "$B/pitch?retailer=constructor"
