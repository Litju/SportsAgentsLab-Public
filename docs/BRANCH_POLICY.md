# Branch policy and GitHub protection

## Repository policy

- DEFAULT_BRANCH=main
- Work branches use work/<linear-id>-<short-description>.
- One issue owns one bounded branch.
- No direct product-feature work is performed on main.
- The Windows-native quality workflow must pass before merge.
- Founder review is required at the acceptance boundary.
- Material authority changes follow authority/MEF_CHANGE_CONTROL.md.
- Secrets, athlete data, and QA run outputs are never committed.

## Observed current policy

The authenticated gh session identified Litju/sportsagentslab-mef as a private
repository with main as the default branch. main currently reports
protected=false. Branch-protection and repository-ruleset API reads returned
HTTP 403 because the current GitHub plan does not enable those features for
this private repository.

CURRENT_POLICY=main is the default branch and is not remotely protected.

## Desired policy

When the repository plan permits it, main should have:

- pull requests required for changes;
- at least one independent approving review;
- stale approvals dismissed after new commits;
- the quality status check required;
- conversation resolution required;
- force-push and branch deletion disabled;
- founder acceptance retained as a human gate.

## Unapplied remote change

No remote setting was changed by ML-94. The following is the exact API shape
to apply later under founder authority after the plan supports it. It is
documented only and was not executed:

    $body = @{
      required_status_checks = @{
        strict = $true
        contexts = @("quality")
      }
      enforce_admins = $true
      required_pull_request_reviews = @{
        dismiss_stale_reviews = $true
        require_code_owner_reviews = $false
        required_approving_review_count = 1
      }
      restrictions = $null
      required_linear_history = $true
      allow_force_pushes = $false
      allow_deletions = $false
      required_conversation_resolution = $true
    } | ConvertTo-Json -Depth 5
    $body | gh api --method PUT repos/Litju/sportsagentslab-mef/branches/main/protection --input -

UNAPPLIED_CHANGES=desired main protection remains documentation-only.
