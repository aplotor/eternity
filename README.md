# [eternity](https://eternity.j9108c.com)

bypass Reddit's 1000-item listing limits by externally storing your Reddit items (saved, created, upvoted, downvoted, hidden) in your own database. new items are automatically synced so you'll never lose your Reddit data again

additional functionality: search for items, filter by subreddit, bulk export data

<br/>

- required [Reddit api oauth2 scopes](https://www.reddit.com/dev/api/oauth)::
	- [identity](https://www.reddit.com/dev/api/oauth#scope_identity): to get your username
	- [history](https://www.reddit.com/dev/api/oauth#scope_history): to get your items
	- [read](https://www.reddit.com/dev/api/oauth#scope_read): to get the icons of subreddits/users
	- [save](https://www.reddit.com/dev/api/oauth#scope_save): to unsave items from your Reddit account (manual action)
	- [edit](https://www.reddit.com/dev/api/oauth#scope_edit): to delete items from your Reddit account (manual action)
	- [vote](https://www.reddit.com/dev/api/oauth#scope_vote): to unvote items from your Reddit account (manual action)
	- [report](https://www.reddit.com/dev/api/oauth#scope_report): to unhide items from your Reddit account (manual action)
