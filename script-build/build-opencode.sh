#!/usr/bin/env bash

# build-opencode.sh
#
# Build script for the opencode package
#
# Usage: ./script-build/build-opencode.sh <VERSION> [options]
#
# Arguments:
#   VERSION    Release version (e.g., v1.2.16, 1.2.16, 1.2.16.1, or 1.2.16.1-buwai)
#
# Options:
#   --validate  Dry-run mode - only run validations, no release
#   -h, --help  Show this help message
#

set -euo pipefail


# Utility functions

log_info() {
    local message="$1"
    local timestamp
    timestamp=$(date +"%Y-%m-%d %H:%M:%S")
    echo "${timestamp} [INFO] ${message}"
}

log_error() {
    local message="$1"
    local timestamp
    timestamp=$(date +"%Y-%m-%d %H:%M:%S")
    echo "${timestamp} [ERROR] ${message}" >&2
    return 1
}

cleanup() {
    local exit_code=$?
    if [[ ${exit_code} -ne 0 ]]; then
        local timestamp
        timestamp=$(date +"%Y-%m-%d %H:%M:%S")
        echo "${timestamp} [ERROR] Script exited with error code ${exit_code}" >&2
    fi
    exit "${exit_code}"
}
# Trap signals for cleanup
trap cleanup ERR EXIT INT

# Validation functions

validate_version() {
    local version="$1"
    if [[ ! "${version}" =~ ^v?[0-9]+\.[0-9]+\.[0-9]+(\.[0-9]+)?(-[a-zA-Z0-9]+)?$ ]]; then
        log_error "Invalid version format: ${version}\nExpected format: v1.2.16, 1.2.16, 1.2.16.1, or 1.2.16.1-buwai"
        return 1
    fi
    log_info "Version validated: ${version}"
}

check_gh_cli() {
    if ! command -v gh &> /dev/null; then
        log_error "gh CLI is not installed\nPlease install from: https://cli.github.com/"
        return 1
    fi
    log_info "gh CLI found: $(command -v gh)"
}

check_gh_auth() {
    if ! gh auth status &> /dev/null; then
        log_error "gh CLI is not authenticated\nPlease run: gh auth login"
        return 1
    fi
    log_info "gh CLI authentication verified"
}

# Release functions

check_release_exists() {
    local version="$1"
    local repo="$2"
    # Ensure version has 'v' prefix for gh commands
    if [[ ! "${version}" =~ ^v ]]; then
        version="v${version}"
    fi
    
    local repo_arg="${repo:+-R }${repo}"
    if gh ${repo_arg} release view "${version}" &> /dev/null; then
        log_error "Release ${version} already exists\nPlease use a different version or delete the existing release first with: gh release delete ${version} --yes"
        return 1
    fi
    log_info "Release ${version} does not exist (good)"
}

create_release() {
    local version="$1"
    local repo="$2"
    local release_title
    local script_dir
    local intermediate_dir
    
    # Get script directory to resolve relative paths
    script_dir="$(cd "$(dirname "$0")" && pwd)"
    intermediate_dir="${script_dir}/intermediate"
    # Ensure version has 'v' prefix
    if [[ ! "${version}" =~ ^v ]]; then
        version="v${version}"
    fi
    
    # Check if intermediate directory exists
    if [[ ! -d "${intermediate_dir}" ]]; then
        log_error "Intermediate directory not found: ${intermediate_dir}\nPlease run the build script to generate packages first"
        return 1
    fi
    
    # Check if checksums.txt exists
    if [[ ! -f "${intermediate_dir}/checksums.txt" ]]; then
        log_error "checksums.txt not found in ${intermediate_dir}\nPlease run the build script to generate checksums first"
        return 1
    fi
    
    # Check if there are tar.gz files
    local tar_count
    tar_count=$(find "${intermediate_dir}" -name "*.tar.gz" | wc -l)
    if [[ ${tar_count} -eq 0 ]]; then
        log_error "No tar.gz files found in ${intermediate_dir}\nPlease run the build script to generate packages first"
        return 1
    fi
    log_info "Found ${tar_count} package tar.gz files"
    
    # Set release title
    release_title="OpenCode ${version}"
    
    local repo_arg="${repo:+-R }${repo}"
    # Create release with assets
    log_info "Creating release ${version} with title '${release_title}'..."
    if ! gh ${repo_arg} release create "${version}" \
        --title "${release_title}" \
        --notes "" \
    --prerelease=false \
        "${intermediate_dir}"/*.tar.gz \
        "${intermediate_dir}/checksums.txt"; then
        log_error "Failed to create release ${version}"
        return 1
    fi
    
    log_info "Release ${version} created successfully"
    return 0
}

verify_release() {
    local version="$1"
    local repo="$2"
    local expected_assets=13  # 12 tar.gz files + 1 checksums.txt
    
    # Ensure version has 'v' prefix
    if [[ ! "${version}" =~ ^v ]]; then
        version="v${version}"
    fi
    
    log_info "Verifying release ${version}..."
    
    local repo_arg="${repo:+-R }${repo}"
    # Check if release exists
    if ! gh ${repo_arg} release view "${version}" &> /dev/null; then
        log_error "Release ${version} does not exist after creation"
        return 1
    fi
    
    # Get release info in one call for efficiency
    local release_json
    release_json=$(gh ${repo_arg} release view "${version}" --json url,name,isPrerelease,isDraft,assets)
    local release_url
    local release_title
    local is_prerelease
    local is_draft
    local asset_count
    
    release_url=$(echo "${release_json}" | jq -r '.url')
    release_title=$(echo "${release_json}" | jq -r '.name')
    is_prerelease=$(echo "${release_json}" | jq -r '.isPrerelease')
    is_draft=$(echo "${release_json}" | jq -r '.isDraft')
    asset_count=$(echo "${release_json}" | jq '.assets | length')
    
    log_info "Release URL: ${release_url}"
    log_info "Release title: ${release_title}"
    log_info "Assets count: ${asset_count}"
    
    # Verify it's not a draft or pre-release
    if [[ "${is_draft}" == "true" ]]; then
        log_error "Release ${version} is marked as draft (should be published)"
        return 1
    fi
    
    if [[ "${is_prerelease}" == "true" ]]; then
        log_error "Release ${version} is marked as pre-release (should be published)"
        return 1
    fi
    
    # Verify asset count
    if [[ ${asset_count} -ne ${expected_assets} ]]; then
        log_error "Expected ${expected_assets} assets, but found ${asset_count}"
        return 1
    fi
    
    log_info "Release ${version} verified successfully"
    log_info "Release URL: ${release_url}"
    return 0
}

# Main

main() {
    local version=""
    local validate_only=false
    local repo=""


    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --validate)
                validate_only=true
                shift
                ;;

            --repo)
                repo="$2"
                shift
                shift
                ;;
            -h|--help)
                echo "Usage: $0 <VERSION> [--repo REPO] [options]"
                echo ""
                echo "  VERSION    Release version (e.g., v1.2.16, 1.2.16, 1.2.16.1, or 1.2.16.1-buwai)"
                echo ""
                echo "Options:"
                echo "  --repo REPO    Target repository (e.g., owner/repo, overrides gh default)"
                echo "  --validate      Dry-run mode - only run validations, no release"
                echo "  -h, --help      Show this help message"
                exit 0
                ;;

            *)
                if [[ -z "${version}" ]]; then
                    version="$1"
                else
                    echo "Usage: $0 <VERSION> [--repo REPO] [--validate]" >&2
                    echo "Run '$0 --help' for more information" >&2
                    log_error "Unknown argument: $1"
                fi
                shift
                ;;
        esac
    done

    # Check version argument
    if [[ -z "${version}" ]]; then
        echo "Usage: $0 <VERSION> [--repo REPO] [--validate]" >&2
        echo "Run '$0 --help' for more information" >&2
        log_error "No version provided"
    fi

    # Run validations
    log_info "Starting validation..."
    validate_version "${version}"
    check_gh_cli
    check_gh_auth
    log_info "All validations passed"

    # If validate_only mode, exit early
    if [[ "${validate_only}" == true ]]; then
        log_info "Validation complete (dry-run mode)"
        exit 0
    fi

    # Create release
    log_info "Starting release creation..."
    check_release_exists "${version}" "${repo}"
    create_release "${version}" "${repo}"
    verify_release "${version}" "${repo}"
    log_info "Release creation complete!"
}

main "$@"
