package handler

import "testing"

func TestEmailMatchesDomainsAllowAndDeny(t *testing.T) {
	if !emailMatchesDomains("a@gmail.com", "") {
		t.Fatal("empty restriction should allow")
	}
	if !emailMatchesDomains("a@gmail.com", "gmail.com,outlook.com") {
		t.Fatal("allow list should match gmail")
	}
	if emailMatchesDomains("a@qq.com", "gmail.com,outlook.com") {
		t.Fatal("allow list should reject qq")
	}
	if !emailMatchesDomains("a@gmail.com", "!qq.com,!163.com") {
		t.Fatal("deny list should allow gmail")
	}
	if emailMatchesDomains("a@qq.com", "!qq.com,!163.com") {
		t.Fatal("deny list should reject qq")
	}
	if normalizeEmailDomains("!QQ.com, @163.COM, !qq.com") != "!qq.com,!163.com" {
		t.Fatalf("normalize deny got %q", normalizeEmailDomains("!QQ.com, @163.COM, !qq.com"))
	}
	if normalizeEmailDomains("Gmail.com, @Outlook.com") != "gmail.com,outlook.com" {
		t.Fatalf("normalize allow got %q", normalizeEmailDomains("Gmail.com, @Outlook.com"))
	}
}
